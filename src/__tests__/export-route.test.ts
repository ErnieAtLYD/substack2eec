import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// server-only is safe in Node but mock it to avoid any env checks
vi.mock('server-only', () => ({}))

// Avoid real JSZip work — we only care about schema/response behavior
vi.mock('@/lib/export', () => ({
  buildZip: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}))

function lesson(n = 1) {
  return {
    lessonNumber: n,
    title: 'Test Lesson',
    subjectLine: 'Test subject',
    previewText: 'Test preview',
    markdownBody: '# Body',
    keyTakeaway: 'Key takeaway',
    filename: `lesson-0${n}-test-lesson.md`,
  }
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/export', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/export — courseTitle fallback contract', () => {
  let POST: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@/app/api/export/route')
    POST = mod.POST
  })

  it('returns 200 with fallback filename when courseTitle is empty string', async () => {
    const res = await POST(request({ lessons: [lesson()], courseTitle: '', courseDescription: 'Desc' }))
    expect(res.status).toBe(200)
    const disposition = res.headers.get('Content-Disposition') ?? ''
    expect(disposition).toContain('email-course-eec.zip')
  })

  it('returns 200 with fallback filename when courseTitle is omitted', async () => {
    const res = await POST(request({ lessons: [lesson()], courseDescription: 'Desc' }))
    expect(res.status).toBe(200)
  })

  it('returns 200 with slugified filename when courseTitle is a valid non-empty string', async () => {
    const res = await POST(request({ lessons: [lesson()], courseTitle: 'My Great Course', courseDescription: 'Desc' }))
    expect(res.status).toBe(200)
    const disposition = res.headers.get('Content-Disposition') ?? ''
    expect(disposition).toContain('my-great-course-eec.zip')
  })

  it('returns 400 when lessons array is empty', async () => {
    const res = await POST(request({ lessons: [], courseTitle: 'Test', courseDescription: 'Desc' }))
    expect(res.status).toBe(400)
  })
})
