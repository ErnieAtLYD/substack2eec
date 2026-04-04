---
status: pending
priority: p2
issue_id: "069"
tags: [code-review, security, rate-limiting, multi-candidate]
dependencies: []
---

# `POST /api/propose-courses` Not Added to Rate Limiter

## Problem Statement

The existing rate limiter in `src/middleware.ts` uses a static `LIMITS` map and a `matcher` array. New routes are NOT automatically covered — they must be added explicitly.

`/api/propose-courses` makes one Anthropic API call that produces 3 complete `CuratedSelection` objects — higher output token cost than the single-candidate `curatePostSelection` call. Without rate limiting, a single IP can call this endpoint in a tight loop, burning Anthropic API quota with no friction.

The plan's Dependencies & Risks table does not list API cost abuse as a risk. The Files to Touch section does not include `src/middleware.ts`.

## Findings

**Source:** Security sentinel (finding 2)

**Affected file:** `src/middleware.ts`

The rate limiter pattern (from prior todo 014 / d037489 commit) adds routes to a `LIMITS` constant and a `matcher` config. The new route must follow the same pattern.

## Proposed Solutions

### Option A — Add to `LIMITS` and `matcher` in same PR as new route (Recommended)

Add to `src/middleware.ts`:
```typescript
'/api/propose-courses': { limit: 3, windowMs: 60_000 },
```

And add `'/api/propose-courses'` to the `matcher` array in the middleware config.

A limit of 3 req/min/IP is appropriate: tighter than `/api/curate` (5 req/min) given the higher Anthropic output token cost per call.

**Pros:** Consistent with existing pattern; prevents API abuse before it can occur
**Effort:** Small (2-line change)
**Risk:** Low

## Recommended Action

Option A. Add `src/middleware.ts` to the plan's "Files to Touch" section with this change noted explicitly. Must ship in the same PR as the new route.

## Technical Details

- **File:** `src/middleware.ts`
- **Pattern:** Same as `/api/curate`, `/api/fetch-posts` rate limit entries

## Acceptance Criteria

- [ ] `/api/propose-courses` added to `LIMITS` with `{ limit: 3, windowMs: 60_000 }`
- [ ] `/api/propose-courses` added to middleware `matcher` array
- [ ] Change is in the same PR as the new route (not a follow-up)
- [ ] Plan's Files to Touch includes `src/middleware.ts`

## Work Log

- 2026-04-04: Created during plan review. Security sentinel flagged.
