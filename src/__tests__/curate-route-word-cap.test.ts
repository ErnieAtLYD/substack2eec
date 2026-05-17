import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_POST_WORDS, MAX_PROMPT_FIELD_LEN, MAX_BODY_CHARS } from '@/lib/limits'
import type { CuratedSelection, GeneratedLesson, SubstackPost } from '@/types'

vi.mock('server-only', () => ({}))

const curatePostSelection = vi.fn()
const rewriteAsLesson = vi.fn()
const parseLessonMarkdown = vi.fn()

vi.mock('@/lib/ai', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai')>('@/lib/ai')
  return {
    curatePostSelection: (...args: unknown[]) => curatePostSelection(...args),
    rewriteAsLesson: (...args: unknown[]) => rewriteAsLesson(...args),
    parseLessonMarkdown: (...args: unknown[]) => parseLessonMarkdown(...args),
    // Cap-fires-before-helper guard: if the route ever forgets to cap a field,
    // this mock throws loudly. (Real helper would also throw — but tests pin
    // the route's responsibility, not the helper's defense-in-depth.)
    collapsePromptWhitespace: (s: string, max: number = MAX_PROMPT_FIELD_LEN) => {
      if (s.length > max) {
        throw new Error(`Test guard: collapsePromptWhitespace received ${s.length} chars (max ${max}) — route should have capped first`)
      }
      return s
    },
    isAnthropicQuotaError: actual.isAnthropicQuotaError,
  }
})

function postFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

async function* emptyChunks() {
  // nothing
}

function curatedSelectionFixture(overrides: Partial<CuratedSelection> = {}): CuratedSelection {
  return {
    courseTitle: 'T',
    courseDescription: 'D',
    targetAudience: 'A',
    overallRationale: 'R',
    lessons: [],
    ...overrides,
  }
}

describe('POST /api/curate — word cap enforcement (regression for #009 / #146)', () => {
  let POST: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.resetModules()
    curatePostSelection.mockReset()
    rewriteAsLesson.mockReset()
    parseLessonMarkdown.mockReset()
    curatePostSelection.mockResolvedValue(curatedSelectionFixture())
    const mod = await import('@/app/api/curate/route')
    POST = mod.POST
  })

  it('truncates client-supplied bodyText to MAX_POST_WORDS before composing the prompt', async () => {
    const oversized = Array.from({ length: 4000 }, (_, i) => `word${i}`).join(' ')
    await (await POST(request({
      posts: [postFixture({ bodyText: oversized })],
      lessonCount: 5,
    }))).text()

    const [postsArg] = curatePostSelection.mock.calls[0]
    const passedBodyText = (postsArg as Array<{ bodyText: string }>)[0].bodyText
    expect(passedBodyText.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(MAX_POST_WORDS)
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

  it('caps title/subtitle/excerpt at MAX_PROMPT_FIELD_LEN on auto-curation branch', async () => {
    const long = 'x'.repeat(450)
    await (await POST(request({
      posts: [postFixture({ title: long, subtitle: long, excerpt: long })],
      lessonCount: 5,
    }))).text()

    const [postsArg] = curatePostSelection.mock.calls[0]
    const p = (postsArg as Array<{ title: string; subtitle: string; excerpt: string }>)[0]
    expect(p.title.length).toBeLessThanOrEqual(MAX_PROMPT_FIELD_LEN)
    expect(p.subtitle.length).toBeLessThanOrEqual(MAX_PROMPT_FIELD_LEN)
    expect(p.excerpt.length).toBeLessThanOrEqual(MAX_PROMPT_FIELD_LEN)
  })

  it('caps bodyText at MAX_BODY_CHARS via safeSlice before word truncation', async () => {
    // 50k chars of ASCII — should be sliced to MAX_BODY_CHARS before word cap
    const huge = 'a'.repeat(50_000)
    await (await POST(request({
      posts: [postFixture({ bodyText: huge })],
      lessonCount: 5,
    }))).text()

    const [postsArg] = curatePostSelection.mock.calls[0]
    const passed = (postsArg as Array<{ bodyText: string }>)[0].bodyText
    expect(passed.length).toBeLessThanOrEqual(MAX_BODY_CHARS)
  })

  it('never emits a lone high surrogate from bodyText truncation', async () => {
    // Build a string where char at MAX_BODY_CHARS - 1 is a high surrogate.
    // Pad to MAX_BODY_CHARS - 1 with ASCII, then add a high surrogate, then more emoji.
    const padding = 'a'.repeat(MAX_BODY_CHARS - 1)
    const tail = '😀'.repeat(100) // emoji = high + low pairs
    const bodyText = padding + tail

    await (await POST(request({
      posts: [postFixture({ bodyText })],
      lessonCount: 5,
    }))).text()

    const [postsArg] = curatePostSelection.mock.calls[0]
    const passed = (postsArg as Array<{ bodyText: string }>)[0].bodyText
    if (passed.length > 0) {
      const lastUnit = passed.charCodeAt(passed.length - 1)
      expect(lastUnit < 0xD800 || lastUnit > 0xDBFF).toBe(true)
    }
  })

  describe('selectedCourse branch', () => {
    const slug = 'lesson-slug'

    function selectedCourseFixture(overrides: Partial<CuratedSelection> = {}): CuratedSelection {
      return {
        courseTitle: 'My Course',
        courseDescription: 'A description.',
        targetAudience: 'Engineers',
        overallRationale: 'Because reasons.',
        lessons: [{
          slug,
          sequencePosition: 1,
          lessonFocus: 'Focus',
          selectionRationale: 'Rationale',
        }],
        ...overrides,
      }
    }

    beforeEach(() => {
      rewriteAsLesson.mockReturnValue(emptyChunks())
      parseLessonMarkdown.mockReturnValue({
        lessonNumber: 1,
        title: 'L1',
        subjectLine: 'subj',
        previewText: 'preview',
        markdownBody: '',
        keyTakeaway: 'k',
        filename: 'lesson-01-x.md',
      } satisfies GeneratedLesson)
    })

    it('caps bodyText to MAX_POST_WORDS on the selectedCourse path (regression for #169)', async () => {
      const oversized = Array.from({ length: 4000 }, (_, i) => `w${i}`).join(' ')
      await (await POST(request({
        posts: [postFixture({ slug, bodyText: oversized })],
        lessonCount: 5,
        selectedCourse: selectedCourseFixture(),
      }))).text()

      expect(rewriteAsLesson).toHaveBeenCalledOnce()
      const passedPost = rewriteAsLesson.mock.calls[0][0] as SubstackPost
      expect(passedPost.bodyText.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(MAX_POST_WORDS)
    })

    it('caps selectedCourse fields at their field-specific Zod maxes, not blanket 300', async () => {
      // Each field at its Zod max so we can prove safeSlice didn't shorten below it.
      const longTitle = 'x'.repeat(60)
      const longDesc = 'y'.repeat(500)
      const longAudience = 'z'.repeat(200)
      const longRationale = 'r'.repeat(500)
      const longFocus = 'f'.repeat(300)
      const longSelRationale = 's'.repeat(300)

      await (await POST(request({
        posts: [postFixture({ slug })],
        lessonCount: 5,
        selectedCourse: selectedCourseFixture({
          courseTitle: longTitle,
          courseDescription: longDesc,
          targetAudience: longAudience,
          overallRationale: longRationale,
          lessons: [{
            slug,
            sequencePosition: 1,
            lessonFocus: longFocus,
            selectionRationale: longSelRationale,
          }],
        }),
      }))).text()

      const sel = rewriteAsLesson.mock.calls[0][3] as CuratedSelection
      expect(sel.courseTitle.length).toBeLessThanOrEqual(60)
      expect(sel.courseDescription.length).toBeLessThanOrEqual(500)
      expect(sel.targetAudience.length).toBeLessThanOrEqual(200)
      expect(sel.overallRationale.length).toBeLessThanOrEqual(500)
      expect(sel.lessons[0].lessonFocus.length).toBeLessThanOrEqual(300)
      expect(sel.lessons[0].selectionRationale.length).toBeLessThanOrEqual(300)
      // And critically: a 500-char field is NOT silently shortened to 300
      expect(sel.courseDescription.length).toBeGreaterThan(300)
    })

  })

  describe('priorLessons cap (Phase 3c, regression for second-order injection)', () => {
    it('caps title and keyTakeaway extracted by parseLessonMarkdown at MAX_PROMPT_FIELD_LEN', async () => {
      // Drive the real parseLessonMarkdown — confirm safeSlice runs.
      // Reset the mock to use the actual implementation for this test.
      vi.resetModules()
      vi.doMock('@/lib/ai', async () => {
        const actual = await vi.importActual<typeof import('@/lib/ai')>('@/lib/ai')
        return {
          curatePostSelection: vi.fn().mockResolvedValue(curatedSelectionFixture()),
          rewriteAsLesson: vi.fn(),
          parseLessonMarkdown: actual.parseLessonMarkdown,
          collapsePromptWhitespace: actual.collapsePromptWhitespace,
          isAnthropicQuotaError: actual.isAnthropicQuotaError,
        }
      })

      const ai = await import('@/lib/ai')
      const longKeyTakeaway = 'k'.repeat(1000)
      const longTitle = 't'.repeat(1000)
      const markdown = `## Lesson 1: ${longTitle}\n\n**Key takeaway:** ${longKeyTakeaway}`
      const result = ai.parseLessonMarkdown(markdown, 1, 'some-slug')

      expect(result.title.length).toBeLessThanOrEqual(MAX_PROMPT_FIELD_LEN)
      expect(result.keyTakeaway.length).toBeLessThanOrEqual(MAX_PROMPT_FIELD_LEN)
    })
  })
})
