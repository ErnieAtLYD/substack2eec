---
status: pending
priority: p2
issue_id: "071"
tags: [code-review, performance, vercel, multi-candidate]
dependencies: []
---

# `/api/propose-courses` Needs `maxDuration` Set to Prevent Vercel Timeout

## Problem Statement

The plan explicitly states "Does not need `maxDuration = 180`" for the new `/api/propose-courses` route. This is incorrect.

On Vercel's Hobby plan, the default serverless function timeout is **10 seconds**. The plan estimates 5–15 seconds for a `proposeCourseCandidates` call. Under tail-case conditions (high Anthropic API load, slow model warmup), this call can take 30–60 seconds even for a non-streaming response. Without `maxDuration`, Vercel silently kills the function at the default timeout, and the client receives a 504 with no useful error.

The plan confuses "doesn't need 180 seconds" (true — streaming is not involved) with "doesn't need any timeout setting" (false — the default is too low).

## Findings

**Source:** Performance oracle (scalability section)

**Reference:** `src/app/api/curate/route.ts:7` — `export const maxDuration = 180` is set there for SSE streaming. The propose-courses route needs a smaller but still explicit value.

**Appropriate value:** `maxDuration = 60` — covers tail-case Claude response times without being as aggressive as the streaming route.

## Proposed Solutions

### Option A — Set `export const maxDuration = 60` on the new route (Recommended)

```typescript
// src/app/api/propose-courses/route.ts
export const maxDuration = 60
```

**Pros:** Prevents 504 errors on slow Claude responses; explicit rather than implicit
**Effort:** Trivial (1 line)
**Risk:** None

## Recommended Action

Option A. Update plan to say `maxDuration = 60` rather than "not needed."

## Technical Details

- **File:** `src/app/api/propose-courses/route.ts` (new file)
- **Vercel default timeout:** 10s (Hobby), 60s (Pro) — neither is safe for tail-case AI calls

## Acceptance Criteria

- [ ] `export const maxDuration = 60` added to the new route
- [ ] Plan updated: replace "Does not need `maxDuration`" with "Set `maxDuration = 60`"

## Work Log

- 2026-04-04: Created during plan review. Performance oracle flagged.
