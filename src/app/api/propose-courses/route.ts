import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { proposeCourseCandidates, isAnthropicQuotaError } from '@/lib/ai'
import { logError } from '@/lib/log-error'
import { safeSlice } from '@/lib/safe-string'
import { MAX_PROMPT_FIELD_LEN } from '@/lib/limits'
import { SubstackPostInputSchema } from '@/types'
import type { LessonCount, ProposeCoursesResponse } from '@/types'

export const maxDuration = 60

const ProposeRequestSchema = z.object({
  posts: z.array(SubstackPostInputSchema.pick({
    slug: true,
    title: true,
    subtitle: true,
    publishedAt: true,
    wordCount: true,
    excerpt: true,
    audience: true,
  })).min(1).max(50),
  lessonCount: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]).optional(),
})

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = ProposeRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const body = parsed.data

  // Trust boundary: cap every short field that reaches the LLM. Same discipline
  // as /api/curate. Schema picks only short fields (no bodyText/bodyHtml here),
  // so no word cap is needed. slug/audience/wordCount/publishedAt left untouched.
  const posts = body.posts.map(p => ({
    ...p,
    title:    safeSlice(p.title, MAX_PROMPT_FIELD_LEN),
    subtitle: p.subtitle === null ? null : safeSlice(p.subtitle, MAX_PROMPT_FIELD_LEN),
    excerpt:  safeSlice(p.excerpt, MAX_PROMPT_FIELD_LEN),
  }))

  const lessonCount: LessonCount = body.lessonCount ?? 5

  try {
    const candidates = await proposeCourseCandidates(posts, lessonCount)
    return NextResponse.json<ProposeCoursesResponse>({ candidates })
  } catch (err) {
    logError('[propose-courses] error:', err)
    if (isAnthropicQuotaError(err)) {
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again later.' },
        { status: 503 },
      )
    }
    const userMessage = err instanceof Error && err.message.startsWith('Candidate proposal')
      ? err.message
      : 'Failed to generate course candidates. Please try again.'
    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}
