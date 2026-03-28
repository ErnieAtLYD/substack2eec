---
status: pending
priority: p2
issue_id: "014"
tags: [code-review, security, rate-limiting]
dependencies: []
---

# No Rate Limiting on Any API Route — Anthropic API Key Abuse Vector

## Problem Statement

All three API routes (`/api/fetch-posts`, `/api/curate`, `/api/export`) have no per-IP or per-session rate limiting. `/api/curate` streams Claude output for up to 180 seconds per call. An unauthenticated caller can loop requests and exhaust the Anthropic API quota. The redesigned UI makes the entry point more discoverable and lowers friction for automation.

**Why it matters:** Financial DoS against the Anthropic API key. Pre-existing but the new prominent UI increases exposure.

## Findings

- `src/app/api/fetch-posts/route.ts` — no rate limit
- `src/app/api/curate/route.ts` — no rate limit, 180s max duration, streams Claude
- `src/app/api/export/route.ts` — no rate limit

## Proposed Solutions

### Option A — Next.js middleware with in-memory token bucket (Recommended for MVP)

Add `src/middleware.ts` with a simple in-memory rate limiter applied to `/api/*`:

```typescript
// 5 req/min on /api/curate, 20 req/min on /api/fetch-posts
```

- **Pros:** Zero new dependencies, works on Vercel Edge
- **Cons:** In-memory; does not survive serverless cold starts (acceptable for MVP)
- **Effort:** Small | **Risk:** Low

### Option B — Upstash Redis rate limiter

Use `@upstash/ratelimit` with a Redis backend for persistent rate limiting across instances.
- **Pros:** Production-grade, survives scaling
- **Cons:** Requires Redis instance, new dependency
- **Effort:** Medium | **Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** New `src/middleware.ts`, all three route files
- **Components:** API routes

## Acceptance Criteria

- [ ] `/api/curate` is rate-limited to ≤5 requests per IP per minute
- [ ] `/api/fetch-posts` is rate-limited to ≤20 requests per IP per minute
- [ ] Rate limit responses return `429` with a `Retry-After` header

## Work Log

- 2026-03-27: Surfaced by security-sentinel agent during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
