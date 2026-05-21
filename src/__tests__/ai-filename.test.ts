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
    const lesson = parseLessonMarkdown(minimalMarkdown(2), 2, '!!!something-useful')
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

  // todo 127 — interior runs of non-alphanumerics must not survive as consecutive hyphens
  it('collapses interior consecutive hyphens introduced by non-alphanumeric chars', () => {
    const lesson = parseLessonMarkdown(minimalMarkdown(4), 4, 'foo!!bar')
    expect(lesson.filename).toBe('lesson-04-foo-bar.md')
    expect(() => GeneratedLessonSchema.parse(lesson)).not.toThrow()
  })
})

// todo 117 + 127 — schema-level filename validation
describe('GeneratedLessonSchema.filename — regex constraints', () => {
  function lesson(filename: string) {
    return {
      lessonNumber: 1,
      title: 'T',
      subjectLine: 'S',
      previewText: 'P',
      markdownBody: 'B',
      keyTakeaway: 'K',
      filename,
    }
  }

  it.each([
    ['lesson-01-getting-started.md'],
    ['a-b.md'],
    ['ab.md'],
    ['lesson-04-foo-bar.md'],
  ])('accepts %s', (name) => {
    expect(() => GeneratedLessonSchema.parse(lesson(name))).not.toThrow()
  })

  it.each([
    ['a--b.md', 'consecutive interior hyphens'],
    ['lesson--01-test.md', 'consecutive interior hyphens after a word'],
    ['x-y--z-w.md', 'consecutive hyphens in the middle of a longer stem'],
    ['ab-.md', 'trailing hyphen'],
    ['lesson-.md', 'trailing hyphen on a longer stem'],
    ['-ab.md', 'leading hyphen'],
    ['a.md', 'single-char stem'],
  ])('rejects %s (%s)', (name) => {
    expect(() => GeneratedLessonSchema.parse(lesson(name))).toThrow()
  })
})
