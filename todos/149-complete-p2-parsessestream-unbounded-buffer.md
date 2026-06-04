---
status: pending
priority: p2
issue_id: "149"
tags: [code-review, security, dos, sse, reliability]
dependencies: []
---

# `parseSSEStream` Buffer Has No Upper Bound

## Problem Statement

`parseSSEStream` accumulates decoded chunks into a `buffer` string until a `\n\n` frame terminator arrives. If the upstream response lacks `\n\n` (e.g. a CDN HTML error page, a misbehaving proxy, or an unusually long single chunk), `buffer` grows without bound until the browser tab OOMs.

Same-origin so not directly attacker-reachable, but a single misconfigured response from `/api/curate` can hard-crash a user's tab. Easy defensive fix.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:84-101`

```ts
buffer += decoder.decode(value, { stream: true })
const parts = buffer.split('\n\n')
buffer = parts.pop() ?? ''
```

Flagged by security-sentinel (P2-1).

## Proposed Solutions

### Option A: Cap buffer at `1_000_000` chars and throw on overflow

```ts
if (buffer.length > 1_000_000) {
  throw new Error('SSE buffer exceeded 1MB without frame terminator — upstream malformed')
}
```

The exception is caught by the existing try/catch in `handleConfirmCandidate`, which routes through `recoverFromStreamException`.

- Pros: Bounds memory; surfaces error to the user via existing path.
- Cons: Threshold is a magic number.
- Effort: Small.

### Option B: Cancel the underlying reader on overflow

Stronger — also cuts the network connection, not just the buffer.

- Pros: Fully releases resources.
- Cons: Slightly more code; needs the reader exposed (also relevant to #153).
- Effort: Small-Medium.

## Recommended Action

_Pending triage._ Pair with #153 (reader cancellation) for a single coherent fix.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [x] Buffer length is bounded; an overflow surfaces a user-facing error
- [x] Test in `parseSSEStream.test.ts` for the overflow case

## Resolution

Landed together with #153 (test-first). Added `MAX_SSE_BUFFER_CHARS = 1_000_000`
to `src/lib/limits.ts` (no `server-only`, importable from the 'use client'
component) and a guard in `parseSSEStream`:

```ts
buffer += decoder.decode(value, { stream: true })
const parts = buffer.split('\n\n')
buffer = parts.pop() ?? ''
if (buffer.length > MAX_SSE_BUFFER_CHARS) {
  throw new Error('SSE buffer exceeded cap without a frame terminator — upstream response malformed')
}
```

**Key design choice:** the cap is checked on the *unterminated remainder* (after
completed frames are popped), not on cumulative throughput. A legitimate stream of
many small frames drains `buffer` each iteration and never trips the cap; only a
single oversized frame with no `\n\n` terminator (CDN HTML error page, proxy, one
giant chunk) does. Two tests pin this: an overflow case (oversized chunk, no
terminator → rejects) and a guard case (frames whose cumulative size far exceeds
the cap but each terminates → no throw). The overflow test was written first and
shown to fail against the uncapped code before the guard landed.

The throw propagates out of the generator → the `for await` in
`handleConfirmCandidate` → the `finally` cancels the reader (#153) → the outer
`catch` routes to `recoverFromStreamException()`, so the user sees a recovery
message instead of a crashed tab.

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.
_2026-06-03:_ Fixed with a buffer cap + tests; landed alongside #153.

## Resources

- security-sentinel review (this review)
- `src/lib/limits.ts` — `MAX_SSE_BUFFER_CHARS`
- `src/components/features/ReviewForm.tsx` — `parseSSEStream` guard + `finally` cancel
- `src/components/features/__tests__/parseSSEStream.test.ts` — overflow + guard tests
