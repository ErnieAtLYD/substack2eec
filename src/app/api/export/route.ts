import { NextRequest, NextResponse } from 'next/server'
import { buildZip } from '@/lib/export'
import type { ExportRequest } from '@/types'

export async function POST(request: NextRequest): Promise<Response> {
  const body: ExportRequest = await request.json()

  if (!body.lessons || body.lessons.length === 0) {
    return NextResponse.json({ error: 'No lessons provided' }, { status: 400 })
  }

  const courseTitle = body.courseTitle ?? 'Email Course'
  const courseDescription = body.courseDescription ?? ''

  let zipBuffer: ArrayBuffer
  try {
    zipBuffer = await buildZip(body.lessons, courseTitle, courseDescription)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build ZIP'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const safeTitle = courseTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeTitle}-eec.zip"`,
    },
  })
}
