import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { proposeCourseCandidates } from '@/lib/ai'
import type { LessonCount, ProposeCoursesResponse } from '@/types'

export const maxDuration = 60

const ProposeRequestSchema = z.object({
  posts: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(100),
    title: z.string().max(500),
    subtitle: z.string().max(500).nullable(),
    publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
    wordCount: z.number().int().min(0).max(100_000),
    excerpt: z.string().max(500),
    audience: z.enum(['everyone', 'paid']),
  })).min(1).max(50),
  lessonCount: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]).optional(),
})

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = ProposeRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const body = parsed.data

  const lessonCount: LessonCount = body.lessonCount ?? 5

  try {
    const candidates = await proposeCourseCandidates(body.posts, lessonCount)
    return NextResponse.json<ProposeCoursesResponse>({ candidates })
  } catch (err) {
    console.error('[propose-courses] error:', err)
    const userMessage = err instanceof Error && err.message.startsWith('Candidate proposal')
      ? err.message
      : 'Failed to generate course candidates. Please try again.'
    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}
