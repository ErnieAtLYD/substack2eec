import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { buildZip } from '@/lib/export'
import { GeneratedLessonSchema } from '@/types'

const ExportRequestSchema = z.object({
  lessons: z.array(GeneratedLessonSchema).min(1).max(50),
  courseTitle: z.string().max(200).default('Email Course').transform(v => v || 'Email Course'),
  courseDescription: z.string().max(1000).default(''),
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

  // strip after slice so truncation at a hyphen boundary doesn't produce a double-hyphen filename
  const safeTitle = (courseTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50)
    .replace(/^-|-$/g, '')) || 'email-course'

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      // safeTitle is guaranteed ASCII after slugification — legacy filename= form is safe
      'Content-Disposition': `attachment; filename="${safeTitle}-eec.zip"`,
    },
  })
}
