---
status: pending
priority: p2
issue_id: "164"
tags: [code-review, performance, concurrency, event-loop]
dependencies: ["163"]
---

# `/api/fetch-posts` Synchronous CPU Blocks The Event Loop Across Concurrent Requests

## Problem Statement

`extractTextFromHtml` runs `cheerio.load` plus DOM manipulation synchronously inside the route handler, once per post (up to 50). Even after #163 reduces per-post cost, the cumulative work per request remains hundreds of ms of pure CPU. On Vercel's Node runtime with concurrency >1 per instance, this stalls every concurrent request waiting on the same lambda — p99 latency degrades catastrophically under load.

Flagged by performance-oracle (P1; demoted here to p2 because traffic is currently low).

## Findings

**Location:** `src/app/api/fetch-posts/route.ts` (the loop that calls `extractTextFromHtml` per post)

The 1-req/sec rate limiter on Substack already serializes the fetch loop, so this is already not a tight CPU loop — but the cheerio work between fetches still doesn't yield. With Fluid Compute (the Vercel default per knowledge update), a single instance can serve multiple concurrent requests; one slow fetch-posts request can stall others.

## Proposed Solutions

### Option A: Yield between posts with `setImmediate` (recommended)

```ts
for (const slug of slugs) {
  await sleep(1000)
  const post = await fetchFullPost(pub, slug)
  const text = extractTextFromHtml(post.body_html)
  // ...
  await new Promise(r => setImmediate(r))   // yield to other requests
}
```

- Pros: Trivial. Lets Fluid Compute interleave concurrent requests.
- Cons: None meaningful.
- Effort: Trivial.

### Option B: Move extraction to a Worker thread

- Pros: True parallelism; doesn't block at all.
- Cons: Worker startup cost likely exceeds extraction cost; complicates deployment. Overkill for current scale.
- Effort: Medium.

### Option C: Defer until #163 lands and measure

If #163 brings per-post extraction under ~10ms, the event-loop hold per request is small enough that this becomes moot.

- Pros: Avoid premature optimization.
- Cons: Still fragile if a single pathological post takes 100ms+.
- Effort: None.

## Recommended Action

_Pending triage._ Option A is the cheapest defense regardless of #163's outcome.

## Technical Details

**Affected files:**
- `src/app/api/fetch-posts/route.ts`

## Acceptance Criteria

- [ ] No synchronous CPU stretch >50ms inside the request handler
- [ ] Concurrent fetch-posts requests on the same instance interleave (verifiable with logging)

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- Vercel Fluid Compute model (concurrent requests share instances)
- Related: #163 (the per-post work this yielding wraps around)
