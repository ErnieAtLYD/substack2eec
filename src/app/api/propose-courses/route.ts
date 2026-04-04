import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { proposeCourseCandidates } from '@/lib/ai'
import { ALLOWED_LESSON_COUNTS } from '@/types'
import type { LessonCount } from '@/types'

export const maxDuration = 60

const MAX_BODY_CHARS = 15_000

const ProposeRequestSchema = z.object({
  posts: z.array(z.object({
    slug: z.string().max(500),
    title: z.string().max(500),
    subtitle: z.string().max(500).nullable(),
    publishedAt: z.string(),
    wordCount: z.number(),
    excerpt: z.string().max(500),
    bodyHtml: z.string(),
    bodyText: z.string(),
    audience: z.enum(['everyone', 'paid']),
  })).min(1).max(50),
  lessonCount: z.number().optional(),
})

function isLessonCount(value: unknown): value is LessonCount {
  return (ALLOWED_LESSON_COUNTS as ReadonlyArray<unknown>).includes(value)
}

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = ProposeRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const body = parsed.data

  const posts = body.posts.map(p => ({
    ...p,
    bodyText: typeof p.bodyText === 'string' ? p.bodyText.slice(0, MAX_BODY_CHARS) : '',
  }))

  const lessonCount = isLessonCount(body.lessonCount) ? body.lessonCount : 5 as LessonCount

  try {
    const candidates = await proposeCourseCandidates(posts, lessonCount)
    return NextResponse.json({ candidates })
  } catch (err) {
    console.error('[propose-courses] error:', err)
    const message = err instanceof Error ? err.message : 'An error occurred proposing course candidates.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
