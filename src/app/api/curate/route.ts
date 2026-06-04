import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { curatePostSelection, rewriteAsLesson, parseLessonMarkdown, collapsePromptWhitespace, isAnthropicQuotaError } from '@/lib/ai'
import { logError } from '@/lib/log-error'
import { truncateTextToWords } from '@/lib/html-text'
import { MAX_BODY_CHARS, MAX_POST_WORDS, MAX_PROMPT_FIELD_LEN } from '@/lib/limits'
import { safeSlice } from '@/lib/safe-string'
import type { GeneratedLesson, CurateSSEEvent, LessonCount, CuratedSelection, SubstackPost } from '@/types'
import { CuratedSelectionSchema, SubstackPostInputSchema, isLessonCount } from '@/types'

export const maxDuration = 180

const CurateRequestSchema = z.object({
  posts: z.array(SubstackPostInputSchema).min(1).max(50),
  lessonCount: z.number(),
  selectedCourse: CuratedSelectionSchema.optional(),
})

function sseEvent(data: CurateSSEEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = CurateRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const body = parsed.data

  // Trust boundary: cap every field that reaches the LLM with a UTF-16-safe
  // slice. title/subtitle/excerpt use the short-field cap; bodyText uses the
  // generous DoS bound (MAX_BODY_CHARS) before the word-aware truncation does
  // the binding LLM-budget cap. slug is never sliced — it must round-trip into
  // postsBySlug.get below.
  const posts = body.posts.map(p => ({
    ...p,
    title:    safeSlice(p.title, MAX_PROMPT_FIELD_LEN),
    subtitle: p.subtitle === null ? null : safeSlice(p.subtitle, MAX_PROMPT_FIELD_LEN),
    excerpt:  safeSlice(p.excerpt, MAX_PROMPT_FIELD_LEN),
    bodyText: truncateTextToWords(
      safeSlice(p.bodyText, MAX_BODY_CHARS),
      MAX_POST_WORDS,
    ),
  } satisfies SubstackPost))

  // Validate selectedCourse slug cross-reference before opening the stream
  if (body.selectedCourse) {
    const postSlugs = new Set(posts.map(p => p.slug))
    const unknownSlugs = body.selectedCourse.lessons
      .map(l => l.slug)
      .filter(s => !postSlugs.has(s))
    if (unknownSlugs.length > 0) {
      return NextResponse.json(
        { error: 'Selected course references posts not in the submitted list.' },
        { status: 400 }
      )
    }
  }

  // Same trust-boundary discipline for selectedCourse fields that flow into
  // rewrite prompts via xmlEscape: safeSlice (UTF-16 safety) then
  // collapsePromptWhitespace (whitespace + bidi-strip), each at the field's
  // existing Zod max — NOT a blanket cap, so no field is silently shortened.
  // slug never sliced — must round-trip into postsBySlug.get.
  const selectedCourse: CuratedSelection | undefined = body.selectedCourse ? {
    ...body.selectedCourse,
    courseTitle:       collapsePromptWhitespace(safeSlice(body.selectedCourse.courseTitle,       60),  60),
    courseDescription: collapsePromptWhitespace(safeSlice(body.selectedCourse.courseDescription, 500), 500),
    targetAudience:    collapsePromptWhitespace(safeSlice(body.selectedCourse.targetAudience,    200), 200),
    overallRationale:  collapsePromptWhitespace(safeSlice(body.selectedCourse.overallRationale,  500), 500),
    lessons: body.selectedCourse.lessons.map(l => ({
      ...l,
      lessonFocus:        collapsePromptWhitespace(safeSlice(l.lessonFocus,        300), 300),
      selectionRationale: collapsePromptWhitespace(safeSlice(l.selectionRationale, 300), 300),
    })),
  } satisfies CuratedSelection : undefined

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Client-disconnect handling (#184): gate on signal.aborted rather than
      // error type — abort manifests both as the SDK's APIUserAbortError and as
      // enqueue throwing once the client is gone; one guard covers both.
      const signal = request.signal
      let closed = false
      const enqueue = (event: CurateSSEEvent) => {
        if (closed || signal.aborted) return
        try {
          controller.enqueue(encoder.encode(sseEvent(event)))
        } catch {
          closed = true // client vanished mid-flush
        }
      }
      const safeClose = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // already closed/errored
        }
      }

      try {
        const lessonCount = isLessonCount(body.lessonCount) ? body.lessonCount : 5 as LessonCount

        // Step 1: Curation — skip if caller provided a pre-selected course.
        // selectedCourse already normalized above (UTF-16-safe + whitespace/bidi-stripped).
        const selection: CuratedSelection = selectedCourse
          ?? await curatePostSelection(posts, lessonCount, signal)
        enqueue({ type: 'selection', data: selection })

        // Step 2: Rewrite each selected lesson in sequence
        const postsBySlug = new Map(posts.map(p => [p.slug, p]))
        const completedLessons: GeneratedLesson[] = []
        const total = selection.lessons.length

        for (const curatedLesson of selection.lessons) {
          if (signal.aborted) break
          const post = postsBySlug.get(curatedLesson.slug)
          if (!post) continue

          const lessonNum = curatedLesson.sequencePosition
          enqueue({ type: 'lesson_start', lessonNumber: lessonNum })

          let fullMarkdown = ''
          for await (const chunk of rewriteAsLesson(post, lessonNum, total, selection, completedLessons, signal)) {
            if (signal.aborted) break
            fullMarkdown += chunk
            enqueue({ type: 'lesson_chunk', lessonNumber: lessonNum, text: chunk })
          }
          if (signal.aborted) break // don't parse/emit a partial lesson_done

          const lesson = parseLessonMarkdown(fullMarkdown, lessonNum, curatedLesson.slug)
          completedLessons.push(lesson)
          enqueue({ type: 'lesson_done', lesson })
        }

        enqueue({ type: 'done', lessons: completedLessons })
      } catch (err) {
        if (signal.aborted) {
          // Client disconnected — expected teardown, not a failure: no log,
          // no error event (there is no one left to read it anyway).
        } else {
          logError('[curate] stream error:', err)
          // SSE response status was already sent (200) when the stream opened, so
          // we can't return 503 here — communicate via the error event message.
          const message = isAnthropicQuotaError(err)
            ? 'AI service temporarily unavailable. Please try again later.'
            : err instanceof Error && err.message.startsWith('No suitable posts')
              ? err.message
              : 'An error occurred generating your course. Please try again.'
          enqueue({ type: 'error', message })
        }
      } finally {
        safeClose()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
