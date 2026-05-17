import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const proposeMock = vi.fn()
vi.mock('@/lib/ai', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai')>('@/lib/ai')
  return {
    proposeCourseCandidates: proposeMock,
    isAnthropicQuotaError: actual.isAnthropicQuotaError,
  }
})

function post(slug = 'a-post') {
  return {
    slug,
    title: 'Title',
    subtitle: null,
    publishedAt: '2026-01-01',
    wordCount: 800,
    excerpt: 'excerpt',
    audience: 'everyone' as const,
  }
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/propose-courses', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/propose-courses error logging', () => {
  let POST: (req: NextRequest) => Promise<Response>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    vi.restoreAllMocks()
    proposeMock.mockReset()
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = await import('@/app/api/propose-courses/route')
    POST = mod.POST
  })

  it('logs structured detail (name, message, status) when Anthropic throws an APIError-shaped object', async () => {
    // Mimics the Anthropic SDK APIError shape without importing the SDK.
    const apiError = Object.assign(new Error('429 rate_limit_error: too many requests'), {
      name: 'RateLimitError',
      status: 429,
    })
    proposeMock.mockRejectedValueOnce(apiError)

    const res = await POST(request({ posts: [post()] }))
    expect(res.status).toBe(500)

    expect(errSpy).toHaveBeenCalledWith('[propose-courses] error:', expect.any(String))
    const payload = JSON.parse(errSpy.mock.calls[0][1] as string)
    expect(payload).toMatchObject({
      name: 'RateLimitError',
      status: 429,
      message: expect.stringContaining('rate_limit_error'),
    })
  })

  it('logs name and message for plain Errors with no status', async () => {
    proposeMock.mockRejectedValueOnce(new Error('Connection reset'))

    const res = await POST(request({ posts: [post()] }))
    expect(res.status).toBe(500)

    const payload = JSON.parse(errSpy.mock.calls[0][1] as string)
    expect(payload).toEqual({ name: 'Error', message: 'Connection reset' })
  })

  it('passes through a "Candidate proposal" thrown message as the user-facing error', async () => {
    proposeMock.mockRejectedValueOnce(new Error('Candidate proposal was truncated (max_tokens). Try with fewer posts.'))

    const res = await POST(request({ posts: [post()] }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Candidate proposal')
  })

  it('returns 503 with a "temporarily unavailable" message when Anthropic credits are exhausted', async () => {
    const quotaError = Object.assign(
      new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'),
      { name: 'Error', status: 400 },
    )
    proposeMock.mockRejectedValueOnce(quotaError)

    const res = await POST(request({ posts: [post()] }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('AI service temporarily unavailable. Please try again later.')

    // Still emits the structured log so operators see the real cause.
    const payload = JSON.parse(errSpy.mock.calls[0][1] as string)
    expect(payload).toMatchObject({
      status: 400,
      message: expect.stringContaining('credit balance is too low'),
    })
  })
})
