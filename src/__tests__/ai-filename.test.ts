import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// Mock Anthropic client — parseLessonMarkdown doesn't call it but the module initialises it
vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn() }))
vi.mock('@/env', () => ({ env: { ANTHROPIC_API_KEY: 'test' } }))

import { parseLessonMarkdown } from '@/lib/ai'
import { GeneratedLessonSchema } from '@/types'

function minimalMarkdown(lessonNum: number) {
  return `## Lesson ${lessonNum}: Test Title\n\n**Subject line:** Test subject\n\n**Preview text:** Test preview\n\n**Key takeaway:** Test takeaway\n\nBody content.`
}

describe('parseLessonMarkdown — filename safeSlug normalization', () => {
  it('strips a single trailing hyphen when slug truncates at position 40', () => {
    // 42-char slug; char 39 (0-indexed) is '-', so slice(0,40) ends with '-'
    const slug = 'a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-uv'
    // after replace (no change) + slice(0,40): 'a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-'
    const lesson = parseLessonMarkdown(minimalMarkdown(1), 1, slug)
    expect(lesson.filename).not.toMatch(/-\.md$/)
    expect(() => GeneratedLessonSchema.parse(lesson)).not.toThrow()
  })

  it('strips leading hyphens when slug starts with non-alphanumeric chars', () => {
    // '!!!' → '---' after replace; strip-edges removes leading hyphens too
    const slug = '!!!something-useful'
    const lesson = parseLessonMarkdown(minimalMarkdown(2), 2, slug)
    expect(lesson.filename).not.toMatch(/^lesson-02--.md/)
    expect(lesson.filename).toMatch(/^lesson-02-something/)
    expect(() => GeneratedLessonSchema.parse(lesson)).not.toThrow()
  })

  it('strips multiple consecutive trailing hyphens', () => {
    // force consecutive trailing hyphens by ending slug with non-alphanum chars
    const slug = 'some-post-title!!!' // '!!!' → '---' after replace, then slice keeps them
    const lesson = parseLessonMarkdown(minimalMarkdown(1), 1, slug)
    expect(lesson.filename).not.toMatch(/-\.md$/)
    expect(() => GeneratedLessonSchema.parse(lesson)).not.toThrow()
  })

  it('falls back to "lesson" when slug is entirely non-alphanumeric', () => {
    const lesson = parseLessonMarkdown(minimalMarkdown(1), 1, '---')
    expect(lesson.filename).toBe('lesson-01-lesson.md')
    expect(() => GeneratedLessonSchema.parse(lesson)).not.toThrow()
  })

  it('leaves a normal slug unchanged', () => {
    const lesson = parseLessonMarkdown(minimalMarkdown(3), 3, 'why-this-matters')
    expect(lesson.filename).toBe('lesson-03-why-this-matters.md')
    expect(() => GeneratedLessonSchema.parse(lesson)).not.toThrow()
  })
})
