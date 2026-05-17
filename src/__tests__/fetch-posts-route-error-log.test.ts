import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const fetchMock = vi.fn()
const normalizeMock = vi.fn((u: string) => u.replace(/^https?:\/\//, '').split(/[/?#]/)[0])
vi.mock('@/lib/substack', () => ({
  fetchPublicPosts: fetchMock,
  normalizeSubstackUrl: normalizeMock,
}))

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/fetch-posts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/fetch-posts error logging', () => {
  let POST: (req: NextRequest) => Promise<Response>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    vi.restoreAllMocks()
    fetchMock.mockReset()
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = await import('@/app/api/fetch-posts/route')
    POST = mod.POST
  })

  it('maps HTTP 429 to 503 and emits structured log line', async () => {
    fetchMock.mockRejectedValueOnce(new Error('HTTP 429 rate-limited'))

    const res = await POST(request({ url: 'https://example.substack.com' }))
    expect(res.status).toBe(503)

    expect(errSpy).toHaveBeenCalledWith('[fetch-posts] error:', expect.any(String))
    const payload = JSON.parse(errSpy.mock.calls[0][1] as string)
    expect(payload).toEqual({ name: 'Error', message: 'HTTP 429 rate-limited' })
  })

  it('preserves SDK-style status field on the structured log', async () => {
    const fetchErr = Object.assign(new Error('HTTP 404 publication not found'), {
      name: 'NotFoundError',
      status: 404,
    })
    fetchMock.mockRejectedValueOnce(fetchErr)

    const res = await POST(request({ url: 'https://example.substack.com' }))
    expect(res.status).toBe(404)

    const payload = JSON.parse(errSpy.mock.calls[0][1] as string)
    expect(payload).toMatchObject({
      name: 'NotFoundError',
      status: 404,
      message: expect.stringContaining('HTTP 404'),
    })
  })
})
