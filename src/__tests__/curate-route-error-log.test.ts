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

function postFixture() {
  return {
    title: 'Test Post',
    subtitle: null,
    slug: 'test-post',
    publishedAt: '2026-01-01',
    bodyHtml: '<p>x</p>',
    excerpt: 'excerpt',
    bodyText: 'one two three.',
    audience: 'everyone' as const,
    wordCount: 100,
  }
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/curate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function parseSseEvents(raw: string): Array<Record<string, unknown>> {
  return raw
    .split('\n\n')
    .map(b => b.trim())
    .filter(b => b.startsWith('data: '))
    .map(b => JSON.parse(b.slice(6)))
}

describe('POST /api/curate error logging', () => {
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

  it('emits structured log line and SSE error event when curation throws an APIError-shaped object', async () => {
    const apiError = Object.assign(new Error('400 invalid_request_error: bad tool schema'), {
      name: 'BadRequestError',
      status: 400,
    })
    curatePostSelection.mockRejectedValueOnce(apiError)

    const res = await POST(request({ posts: [postFixture()], lessonCount: 5 }))
    expect(res.status).toBe(200) // SSE always 200; the error rides on the stream

    const events = parseSseEvents(await res.text())
    const errorEvent = events.find(e => e.type === 'error')
    expect(errorEvent).toMatchObject({
      type: 'error',
      message: 'An error occurred generating your course. Please try again.',
    })

    expect(errSpy).toHaveBeenCalledWith('[curate] stream error:', expect.any(String))
    const payload = JSON.parse(errSpy.mock.calls[0][1] as string)
    expect(payload).toMatchObject({
      name: 'BadRequestError',
      status: 400,
      message: expect.stringContaining('invalid_request_error'),
    })
  })

  it('emits a "temporarily unavailable" SSE error message when Anthropic credits are exhausted', async () => {
    const quotaError = Object.assign(
      new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'),
      { name: 'Error', status: 400 },
    )
    curatePostSelection.mockRejectedValueOnce(quotaError)

    const res = await POST(request({ posts: [postFixture()], lessonCount: 5 }))
    expect(res.status).toBe(200) // SSE always 200; status can't change mid-stream

    const events = parseSseEvents(await res.text())
    const errorEvent = events.find(e => e.type === 'error')
    expect(errorEvent?.message).toBe('AI service temporarily unavailable. Please try again later.')
  })

  it('passes through "No suitable posts" thrown message as the user-facing SSE error', async () => {
    curatePostSelection.mockRejectedValueOnce(new Error('No suitable posts found in this archive.'))

    const res = await POST(request({ posts: [postFixture()], lessonCount: 5 }))
    const events = parseSseEvents(await res.text())
    const errorEvent = events.find(e => e.type === 'error')
    expect(errorEvent?.message).toContain('No suitable posts')

    const payload = JSON.parse(errSpy.mock.calls[0][1] as string)
    expect(payload).toEqual({ name: 'Error', message: 'No suitable posts found in this archive.' })
  })
})
