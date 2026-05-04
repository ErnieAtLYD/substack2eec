import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { curatePostSelection, rewriteAsLesson, parseLessonMarkdown, sanitizeForPrompt } from '@/lib/ai'
import { MAX_POST_WORDS, truncateTextToWords } from '@/lib/html-text'
import type { GeneratedLesson, CurateSSEEvent, LessonCount, CuratedSelection } from '@/types'
import { MAX_BODY_CHARS, CuratedSelectionSchema, SubstackPostSchema, isLessonCount } from '@/types'

export const maxDuration = 180

const CurateRequestSchema = z.object({
  posts: z.array(SubstackPostSchema).min(1).max(50),
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

  // Defense-in-depth: char slice bounds DoS surface before the word-aware
  // truncation does the cap that the LLM budget actually depends on. UI callers
  // already pre-truncate; this is the enforcement point for direct API callers.
  const posts = body.posts.map(p => ({
    ...p,
    bodyText: truncateTextToWords(
      (typeof p.bodyText === 'string' ? p.bodyText : '').slice(0, MAX_BODY_CHARS),
      MAX_POST_WORDS,
    ),
  }))

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

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: CurateSSEEvent) =>
        controller.enqueue(encoder.encode(sseEvent(event)))

      try {
        const lessonCount = isLessonCount(body.lessonCount) ? body.lessonCount : 5 as LessonCount

        // Step 1: Curation — skip if caller provided a pre-selected course
        let selection: CuratedSelection
        if (body.selectedCourse) {
          // selectedCourse already validated above — just sanitize
          const sc = body.selectedCourse
          selection = {
            ...sc,
            courseTitle:       sanitizeForPrompt(sc.courseTitle),
            courseDescription: sanitizeForPrompt(sc.courseDescription),
            targetAudience:    sanitizeForPrompt(sc.targetAudience),
            overallRationale:  sanitizeForPrompt(sc.overallRationale),
            lessons: sc.lessons.map(l => ({
              ...l,
              lessonFocus:        sanitizeForPrompt(l.lessonFocus),
              selectionRationale: sanitizeForPrompt(l.selectionRationale),
            })),
          }
        } else {
          selection = await curatePostSelection(posts, lessonCount)
        }
        enqueue({ type: 'selection', data: selection })

        // Step 2: Rewrite each selected lesson in sequence
        const postsBySlug = new Map(posts.map(p => [p.slug, p]))
        const completedLessons: GeneratedLesson[] = []
        const total = selection.lessons.length

        for (const curatedLesson of selection.lessons) {
          const post = postsBySlug.get(curatedLesson.slug)
          if (!post) continue

          const lessonNum = curatedLesson.sequencePosition
          enqueue({ type: 'lesson_start', lessonNumber: lessonNum })

          let fullMarkdown = ''
          for await (const chunk of rewriteAsLesson(post, lessonNum, total, selection, completedLessons)) {
            fullMarkdown += chunk
            enqueue({ type: 'lesson_chunk', lessonNumber: lessonNum, text: chunk })
          }

          const lesson = parseLessonMarkdown(fullMarkdown, lessonNum, curatedLesson.slug)
          completedLessons.push(lesson)
          enqueue({ type: 'lesson_done', lesson })
        }

        enqueue({ type: 'done', lessons: completedLessons })
      } catch (err) {
        console.error('[curate] stream error:', err)
        const message = err instanceof Error && err.message.startsWith('No suitable posts')
          ? err.message
          : 'An error occurred generating your course. Please try again.'
        enqueue({ type: 'error', message })
      } finally {
        controller.close()
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
