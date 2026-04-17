import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// server-only is safe in Node but mock it to avoid any env checks
vi.mock('server-only', () => ({}))

// Avoid real JSZip work — we only care about schema/response behavior
vi.mock('@/lib/export', () => ({
  buildZip: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}))

function lesson(overrides: Partial<ReturnType<typeof defaultLesson>> = {}) {
  return { ...defaultLesson(), ...overrides }
}

function defaultLesson() {
  return {
    lessonNumber: 1,
    title: 'Test Lesson',
    subjectLine: 'Test subject',
    previewText: 'Test preview',
    markdownBody: '# Body',
    keyTakeaway: 'Key takeaway',
    filename: 'lesson-01-test-lesson.md',
  }
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/export', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/export', () => {
  let POST: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@/app/api/export/route')
    POST = mod.POST
  })

  // --- courseTitle fallback contract (todo 116) ---

  it('returns 200 with fallback filename when courseTitle is empty string', async () => {
    const res = await POST(request({ lessons: [lesson()], courseTitle: '', courseDescription: 'Desc' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toContain('email-course-eec.zip')
  })

  it('returns 200 with fallback filename when courseTitle is omitted', async () => {
    const res = await POST(request({ lessons: [lesson()], courseDescription: 'Desc' }))
    expect(res.status).toBe(200)
  })

  it('returns 200 with slugified filename for a valid courseTitle', async () => {
    const res = await POST(request({ lessons: [lesson()], courseTitle: 'My Great Course', courseDescription: 'Desc' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toContain('my-great-course-eec.zip')
  })

  it('returns 400 when lessons array is empty', async () => {
    const res = await POST(request({ lessons: [], courseTitle: 'Test', courseDescription: 'Desc' }))
    expect(res.status).toBe(400)
  })

  // --- filename regex (todo 117) ---

  it('rejects a filename with a trailing hyphen stem (ab-.md)', async () => {
    const res = await POST(request({ lessons: [lesson({ filename: 'ab-.md' })], courseTitle: 'Test' }))
    expect(res.status).toBe(400)
  })

  it('rejects a single-character stem filename (a.md)', async () => {
    const res = await POST(request({ lessons: [lesson({ filename: 'a.md' })], courseTitle: 'Test' }))
    expect(res.status).toBe(400)
  })

  it('accepts a well-formed filename (lesson-01-getting-started.md)', async () => {
    const res = await POST(request({ lessons: [lesson({ filename: 'lesson-01-getting-started.md' })], courseTitle: 'Test' }))
    expect(res.status).toBe(200)
  })

  // --- safeTitle strip-after-slice (todo 118) ---

  it('produces no double-hyphen when courseTitle truncates at a hyphen boundary', async () => {
    // 50 chars of lowercase alphanumeric + hyphen, ending in a hyphen at char 50
    // "aaaaaaaaa-aaaaaaaaa-aaaaaaaaa-aaaaaaaaa-aaaaaaaaa-" is 50 chars ending in '-'
    const longTitle = 'aaaaaaaaa-aaaaaaaaa-aaaaaaaaa-aaaaaaaaa-aaaaaaaaa-extra'
    const res = await POST(request({ lessons: [lesson()], courseTitle: longTitle }))
    expect(res.status).toBe(200)
    const disposition = res.headers.get('Content-Disposition') ?? ''
    expect(disposition).not.toMatch(/--eec\.zip/)
  })

  // --- all-symbol courseTitle falls back to email-course (safeTitle guard) ---

  it('falls back to email-course slug when courseTitle contains only non-alphanumeric chars', async () => {
    const res = await POST(request({ lessons: [lesson()], courseTitle: '!!!' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toContain('email-course-eec.zip')
  })
})
