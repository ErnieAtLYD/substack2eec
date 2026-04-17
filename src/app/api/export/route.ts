import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { buildZip } from '@/lib/export'

const ExportRequestSchema = z.object({
  lessons: z.array(z.object({
    lessonNumber: z.number(),
    title: z.string().max(500),
    subjectLine: z.string().max(50),
    previewText: z.string().max(90),
    markdownBody: z.string().max(50_000),
    keyTakeaway: z.string().max(500),
    filename: z.string().regex(/^[a-z0-9][a-z0-9-]+\.md$/).max(80),
  })).min(1).max(50),
  courseTitle: z.string().max(200).default('Email Course').transform(v => v || 'Email Course'),
  courseDescription: z.string().max(1000),
})

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = ExportRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const body = parsed.data

  const courseTitle = body.courseTitle
  const courseDescription = body.courseDescription

  let zipBuffer: ArrayBuffer
  try {
    zipBuffer = await buildZip(body.lessons, courseTitle, courseDescription)
  } catch (err) {
    console.error('[export] buildZip error:', err)
    return NextResponse.json({ error: 'Failed to build ZIP' }, { status: 500 })
  }

  const safeTitle = (courseTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)) || 'email-course'

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeTitle}-eec.zip"`,
    },
  })
}
