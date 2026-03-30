import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { curatePostSelection, rewriteAsLesson, parseLessonMarkdown } from '@/lib/ai'
import type { GeneratedLesson, CurateSSEEvent, LessonCount } from '@/types'
import { ALLOWED_LESSON_COUNTS } from '@/types'

export const maxDuration = 180

const MAX_BODY_CHARS = 15_000

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
})

function sseEvent(data: CurateSSEEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function isLessonCount(value: unknown): value is LessonCount {
  return ALLOWED_LESSON_COUNTS.includes(value as LessonCount)
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
        // Step 1: Curation
        const lessonCount = isLessonCount(body.lessonCount) ? body.lessonCount : 5 as LessonCount
        const selection = await curatePostSelection(posts, lessonCount)
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
