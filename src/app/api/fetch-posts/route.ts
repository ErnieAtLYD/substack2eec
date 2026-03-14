import { NextRequest, NextResponse } from 'next/server'
import { normalizeSubstackUrl, fetchPublicPosts } from '@/lib/substack'
import type { FetchPostsRequest, FetchPostsResponse } from '@/types'

export async function POST(request: NextRequest): Promise<NextResponse<FetchPostsResponse | { error: string }>> {
  const body: FetchPostsRequest = await request.json()

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  let pub: string
  try {
    pub = normalizeSubstackUrl(body.url)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid URL' },
      { status: 400 },
    )
  }

  let result
  try {
    result = await fetchPublicPosts(pub, 50)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch posts'
    const status = msg.includes('HTTP 404') ? 404 : msg.includes('HTTP 429') ? 503 : 500
    return NextResponse.json({ error: msg }, { status })
  }

  if (result.posts.length === 0) {
    return NextResponse.json(
      { error: 'No public posts found. This publication may be entirely paywalled.' },
      { status: 422 },
    )
  }

  return NextResponse.json({ posts: result.posts, skippedCount: result.skippedCount })
}
