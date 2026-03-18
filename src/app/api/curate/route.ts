import { NextRequest } from 'next/server'
import { curatePostSelection, rewriteAsLesson, parseLessonMarkdown } from '@/lib/ai'
import type { CurateRequest, GeneratedLesson, CurateSSEEvent } from '@/types'

export const maxDuration = 180

function sseEvent(data: CurateSSEEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(request: NextRequest): Promise<Response> {
  const body: CurateRequest = await request.json()

  if (!body.posts || body.posts.length === 0) {
    return new Response(
      sseEvent({ type: 'error', message: 'No posts provided' }),
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } },
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: CurateSSEEvent) =>
        controller.enqueue(encoder.encode(sseEvent(event)))

      try {
        // Step 1: Curation
        const lessonCount = typeof body.lessonCount === 'number' && body.lessonCount > 0
          ? body.lessonCount
          : 5
        const selection = await curatePostSelection(body.posts, lessonCount)
        enqueue({ type: 'selection', data: selection })

        // Step 2: Rewrite each selected lesson in sequence
        const postsBySlug = new Map(body.posts.map(p => [p.slug, p]))
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
        const message = err instanceof Error ? err.message : 'Unknown error'
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
