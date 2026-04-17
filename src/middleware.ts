import { NextRequest, NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store — acceptable for MVP/single-instance; does not survive cold starts
const store = new Map<string, RateLimitEntry>()

// Prune expired entries every 60 seconds to prevent unbounded map growth
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key)
  }
}, 60_000)

function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  if (entry.count >= limit) return true

  entry.count++
  return false
}

const LIMITS: Record<string, { limit: number; windowMs: number }> = {
  '/api/curate': { limit: 5, windowMs: 60_000 },
  '/api/fetch-posts': { limit: 20, windowMs: 60_000 },
  '/api/export': { limit: 20, windowMs: 60_000 },
  '/api/propose-courses': { limit: 3, windowMs: 60_000 },
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const config = LIMITS[pathname]

  if (!config) return NextResponse.next()

  const ip =
    // request.ip is injected by Vercel's edge and is non-spoofable
    (request as NextRequest & { ip?: string }).ip ??
    // x-vercel-forwarded-for is set by Vercel at ingress and cannot be spoofed by clients;
    // split defensively in case Vercel ever emits a comma-separated list in forwarding scenarios
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    // TODO: todos/099 — 'unknown' is a shared bucket; consider rejecting instead of silently accepting
    'unknown'
  const key = `${ip}:${pathname}`

  if (isRateLimited(key, config.limit, config.windowMs)) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': '60' },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/curate', '/api/fetch-posts', '/api/export', '/api/propose-courses'],
}
