---
status: complete
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

- [x] No synchronous CPU stretch >50ms inside the request handler — extraction is the only CPU work and is <1ms typical / ~7.5ms at a 4000-item pathological post after #163
- [x] Concurrent fetch-posts requests on the same instance interleave — the unconditional `await sleep(1_000)` before every post already yields the event loop

## Resolution

**Closed without a code change — already satisfied after #163.** The Problem
Statement's premise ("the cumulative work per request remains hundreds of ms of
pure CPU" that "stalls every concurrent request") does not match the actual
loop. The fetch loop lives in `src/lib/substack.ts:132-136` (not the route
handler), and it is structured so the CPU work never runs as one continuous
burst:

```ts
for (const slug of targets) {
  await sleep(1_000)                          // unconditional ~1s yield, every iteration
  const post = await fetchFullPost(pub, slug) // await fetch() yields; then extractTextFromHtml runs
  posts.push(post)
}
```

Each `extractTextFromHtml` call is isolated between two awaits (`sleep(1000)` and
`fetch()`), both of which fully yield the event loop. The loop is therefore never
CPU-bound for more than a single extraction at a time. Post-#163 that extraction
is sub-millisecond for typical posts and ~7.5ms even at a stress-test 4000-`<li>`
post (measured in `src/lib/__tests__/html-text.bench.ts`) — well under the 50ms
criterion. You would need ~30,000 list items in one post to approach a 50ms hold.

This is exactly the outcome **Option C** predicted: "If #163 brings per-post
extraction under ~10ms... this becomes moot." It did. Option A's
`await new Promise(r => setImmediate(r))` would be a redundant no-op — a "yield to
the event loop" placed immediately after a line that already yields for 1000ms —
so it was deliberately not added (cargo-cult code a reviewer would rightly
question).

Same overstated-severity pattern as #163: the original P1 framing did not survive
reading the actual code path.

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.
_2026-06-03:_ Verified already-satisfied after #163 landed; closed without code.
See Resolution above.

## Resources

- Vercel Fluid Compute model (concurrent requests share instances)
- Related: #163 (the per-post work this yielding wraps around)
