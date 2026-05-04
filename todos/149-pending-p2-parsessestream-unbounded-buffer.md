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

- [ ] Buffer length is bounded; an overflow surfaces a user-facing error
- [ ] Test in `parseSSEStream.test.ts` for the overflow case

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- security-sentinel review (this review)
