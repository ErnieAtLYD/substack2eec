import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_PROMPT_FIELD_LEN } from '@/lib/limits'

vi.mock('server-only', () => ({}))

const proposeMock = vi.fn()

vi.mock('@/lib/ai', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai')>('@/lib/ai')
  return {
    proposeCourseCandidates: proposeMock,
    isAnthropicQuotaError: actual.isAnthropicQuotaError,
  }
})

function postFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'a-post',
    title: 'A title',
    subtitle: null,
    publishedAt: '2026-01-01',
    wordCount: 100,
    excerpt: 'excerpt',
    audience: 'everyone',
    ...overrides,
  }
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/propose-courses', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/propose-courses — trust-boundary caps', () => {
  let POST: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.resetModules()
    proposeMock.mockReset()
    proposeMock.mockResolvedValue([])
    const mod = await import('@/app/api/propose-courses/route')
    POST = mod.POST
  })

  it('caps title/subtitle/excerpt at MAX_PROMPT_FIELD_LEN before the AI call', async () => {
    const long = 'x'.repeat(450)
    await POST(request({
      posts: [postFixture({ title: long, subtitle: long, excerpt: long })],
    }))

    const [postsArg] = proposeMock.mock.calls[0]
    const p = (postsArg as Array<{ title: string; subtitle: string; excerpt: string }>)[0]
    expect(p.title.length).toBeLessThanOrEqual(MAX_PROMPT_FIELD_LEN)
    expect(p.subtitle.length).toBeLessThanOrEqual(MAX_PROMPT_FIELD_LEN)
    expect(p.excerpt.length).toBeLessThanOrEqual(MAX_PROMPT_FIELD_LEN)
  })

  it('preserves null subtitle without slicing', async () => {
    await POST(request({ posts: [postFixture({ subtitle: null })] }))
    const [postsArg] = proposeMock.mock.calls[0]
    expect((postsArg as Array<{ subtitle: string | null }>)[0].subtitle).toBeNull()
  })

  it('never emits a lone high surrogate on capped fields', async () => {
    // Pad to MAX_PROMPT_FIELD_LEN - 1 then start an emoji so the cut lands on the high surrogate
    const title = 'a'.repeat(MAX_PROMPT_FIELD_LEN - 1) + '😀😀😀'
    await POST(request({ posts: [postFixture({ title })] }))

    const [postsArg] = proposeMock.mock.calls[0]
    const passed = (postsArg as Array<{ title: string }>)[0].title
    if (passed.length > 0) {
      const last = passed.charCodeAt(passed.length - 1)
      expect(last < 0xD800 || last > 0xDBFF).toBe(true)
    }
  })

  it('strips bodyHtml from input (schema split — Phase 3d)', async () => {
    await POST(request({
      posts: [{ ...postFixture(), bodyHtml: '<p>should be stripped</p>' }],
    }))
    const [postsArg] = proposeMock.mock.calls[0]
    expect((postsArg as Array<{ bodyHtml?: string }>)[0].bodyHtml).toBeUndefined()
  })
})
