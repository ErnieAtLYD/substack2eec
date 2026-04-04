import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { curatePostSelection, rewriteAsLesson, parseLessonMarkdown, sanitizeForPrompt } from '@/lib/ai'
import type { GeneratedLesson, CurateSSEEvent, LessonCount, CuratedSelection } from '@/types'
import { ALLOWED_LESSON_COUNTS } from '@/types'

export const maxDuration = 180

const MAX_BODY_CHARS = 15_000

const CuratedLessonSchema = z.object({
  slug: z.string().max(500),
  sequencePosition: z.number().int().min(1).max(10),
  lessonFocus: z.string().max(300),
  selectionRationale: z.string().max(300),
})

const CuratedSelectionSchema = z.object({
  courseTitle: z.string().max(60),
  courseDescription: z.string().max(500),
  targetAudience: z.string().max(200),
  overallRationale: z.string().max(500),
  lessons: z.array(CuratedLessonSchema).min(1).max(10),
})

const CurateRequestSchema = z.object({
  posts: z.array(z.object({
    slug: z.string().max(500),
    title: z.string().max(500),
    subtitle: z.string().max(500).nullable(),
    publishedAt: z.string(),
    wordCount: z.number(),
    excerpt: z.string().max(500),
    bodyHtml: z.string(),
    bodyText: z.string(),
    audience: z.enum(['everyone', 'paid']),
  })).min(1).max(50),
  lessonCount: z.number(),
  selectedCourse: CuratedSelectionSchema.optional(),
})

function sseEvent(data: CurateSSEEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function isLessonCount(value: unknown): value is LessonCount {
  return (ALLOWED_LESSON_COUNTS as ReadonlyArray<unknown>).includes(value)
}

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = CurateRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const body = parsed.data

  const posts = body.posts.map(p => ({
    ...p,
    bodyText: typeof p.bodyText === 'string' ? p.bodyText.slice(0, MAX_BODY_CHARS) : '',
  }))

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
          // Validate slug cross-reference: all lesson slugs must be in the submitted posts
          const postsBySlugCheck = new Map(posts.map(p => [p.slug, true]))
          const unknownSlugs = body.selectedCourse.lessons
            .map(l => l.slug)
            .filter(s => !postsBySlugCheck.has(s))
          if (unknownSlugs.length > 0) {
            enqueue({ type: 'error', message: 'Selected course references posts not in the submitted list.' })
            controller.close()
            return
          }

          // Sanitize client-supplied string fields before they reach AI prompts
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
