import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_POST_WORDS } from '@/lib/html-text'

vi.mock('server-only', () => ({}))

const curatePostSelection = vi.fn()
const rewriteAsLesson = vi.fn()

vi.mock('@/lib/ai', () => ({
  curatePostSelection: (...args: unknown[]) => curatePostSelection(...args),
  rewriteAsLesson: (...args: unknown[]) => rewriteAsLesson(...args),
  parseLessonMarkdown: vi.fn(),
  sanitizeForPrompt: (s: string) => s,
}))

function postFixture(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  }
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/curate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/curate — word cap enforcement (regression for #009 / #146)', () => {
  let POST: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.resetModules()
    curatePostSelection.mockReset()
    rewriteAsLesson.mockReset()
    // Resolve curation with no lessons so the stream closes cleanly
    curatePostSelection.mockResolvedValue({
      courseTitle: 'T',
      courseDescription: 'D',
      targetAudience: 'A',
      overallRationale: 'R',
      lessons: [],
    })
    const mod = await import('@/app/api/curate/route')
    POST = mod.POST
  })

  it('truncates client-supplied bodyText to MAX_POST_WORDS before composing the prompt', async () => {
    // 4000 words — well over MAX_POST_WORDS (2500)
    const oversized = Array.from({ length: 4000 }, (_, i) => `word${i}`).join(' ')

    const res = await POST(request({
      posts: [postFixture({ bodyText: oversized })],
      lessonCount: 5,
    }))

    expect(res.status).toBe(200)
    // Drain the SSE stream so the start() lambda completes
    await res.text()

    expect(curatePostSelection).toHaveBeenCalledOnce()
    const [postsArg] = curatePostSelection.mock.calls[0]
    const passedBodyText = (postsArg as Array<{ bodyText: string }>)[0].bodyText
    const passedWordCount = passedBodyText.split(/\s+/).filter(Boolean).length

    expect(passedWordCount).toBeLessThanOrEqual(MAX_POST_WORDS)
  })

  it('does not truncate already-short bodyText', async () => {
    const short = 'just a short body of text'
    await (await POST(request({
      posts: [postFixture({ bodyText: short })],
      lessonCount: 5,
    }))).text()

    const [postsArg] = curatePostSelection.mock.calls[0]
    expect((postsArg as Array<{ bodyText: string }>)[0].bodyText).toBe(short)
  })
})
