import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const curatePostSelection = vi.fn()
const rewriteAsLesson = vi.fn()

vi.mock('@/lib/ai', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai')>('@/lib/ai')
  return {
    curatePostSelection: (...args: unknown[]) => curatePostSelection(...args),
    rewriteAsLesson: (...args: unknown[]) => rewriteAsLesson(...args),
    parseLessonMarkdown: vi.fn(),
    collapsePromptWhitespace: (s: string) => s,
    isAnthropicQuotaError: actual.isAnthropicQuotaError,
  }
})

function postFixture(slug: string) {
  return {
    title: `Post ${slug}`,
    subtitle: null,
    slug,
    publishedAt: '2026-01-01',
    bodyHtml: '<p>x</p>',
    excerpt: 'excerpt',
    bodyText: 'one two three.',
    audience: 'everyone' as const,
    wordCount: 100,
  }
}

function selectionFixture() {
  return {
    courseTitle: 'Course',
    courseDescription: 'Desc',
    targetAudience: 'Audience',
    overallRationale: 'Rationale',
    lessons: [
      { sequencePosition: 1, slug: 'post-1', lessonFocus: 'f1', selectionRationale: 'r1' },
      { sequencePosition: 2, slug: 'post-2', lessonFocus: 'f2', selectionRationale: 'r2' },
    ],
  }
}

/** Mimics @anthropic-ai/sdk's APIUserAbortError shape (no numeric status). */
function abortError() {
  return Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' })
}

/** Resolves never; rejects with an abort-shaped error when `signal` fires. */
function rejectOnAbort(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) return reject(abortError())
    signal?.addEventListener('abort', () => reject(abortError()), { once: true })
  })
}

function parseSseEvents(raw: string): Array<Record<string, unknown>> {
  return raw
    .split('\n\n')
    .map(b => b.trim())
    .filter(b => b.startsWith('data: '))
    .map(b => JSON.parse(b.slice(6)))
}

describe('POST /api/curate client-disconnect abort (#184)', () => {
  let POST: (req: NextRequest) => Promise<Response>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    vi.restoreAllMocks()
    curatePostSelection.mockReset()
    rewriteAsLesson.mockReset()
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = await import('@/app/api/curate/route')
    POST = mod.POST
  })

  function request(body: Record<string, unknown>, signal: AbortSignal) {
    return new NextRequest('http://localhost/api/curate', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      signal,
    })
  }

  it('stops the lesson loop mid-stream without logging or emitting an error event', async () => {
    const controller = new AbortController()
    let secondLessonStarted = false

    curatePostSelection.mockResolvedValueOnce(selectionFixture())
    rewriteAsLesson.mockImplementation(async function* (...args: unknown[]) {
      const lessonNum = args[1] as number
      const signal = args[5] as AbortSignal | undefined
      if (lessonNum === 2) secondLessonStarted = true
      yield `chunk for lesson ${lessonNum}`
      // Like the real SDK stream: hangs until the signal aborts, then throws.
      await rejectOnAbort(signal)
    })

    const res = await POST(request(
      { posts: [postFixture('post-1'), postFixture('post-2')], lessonCount: 5 },
      controller.signal,
    ))
    expect(res.status).toBe(200)

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let raw = ''
    // Read until lesson 1's first chunk has arrived, then disconnect.
    while (!raw.includes('lesson_chunk')) {
      const { done, value } = await reader.read()
      if (done) break
      raw += decoder.decode(value, { stream: true })
    }
    controller.abort()
    // Drain to completion — the stream must close, not hang.
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      raw += decoder.decode(value, { stream: true })
    }

    const events = parseSseEvents(raw)
    expect(events.some(e => e.type === 'lesson_chunk')).toBe(true)
    expect(events.some(e => e.type === 'error')).toBe(false) // abort is not a failure
    expect(events.some(e => e.type === 'done')).toBe(false)  // generation stopped early
    expect(secondLessonStarted).toBe(false)                  // no further lessons begun
    expect(errSpy).not.toHaveBeenCalled()                    // no [curate] stream error log
  })

  it('treats an abort during the curation step as silent teardown', async () => {
    const controller = new AbortController()
    curatePostSelection.mockImplementation((...args: unknown[]) =>
      rejectOnAbort(args[2] as AbortSignal | undefined),
    )

    const res = await POST(request({ posts: [postFixture('post-1')], lessonCount: 5 }, controller.signal))
    controller.abort()

    const events = parseSseEvents(await res.text())
    expect(events).toHaveLength(0)          // nothing emitted — client is gone
    expect(errSpy).not.toHaveBeenCalled()   // abort never logged as a real failure
  })
})
