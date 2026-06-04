---
status: complete
priority: p2
issue_id: "153"
tags: [code-review, performance, reliability, sse]
dependencies: ["149"]
---

# SSE Reader Not Cancelled When `parseSSEStream` Loop Exits Early

## Problem Statement

`parseSSEStream(res.body.getReader())` returns an async generator. When the `for await` loop exits via `return` (on `done`, on `error`, or on a thrown exception), the underlying `ReadableStreamDefaultReader` is not explicitly cancelled. The async generator's implicit cleanup releases the iterator but does not propagate cancellation. If bytes are in flight, the network connection stays open until GC.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:291-305`

Flagged by performance-oracle (P2).

## Proposed Solutions

### Option A: Acquire reader once, cancel in `finally`

```ts
const reader = res.body.getReader()
try {
  for await (const event of parseSSEStream(reader)) { /* ... */ }
} finally {
  reader.cancel().catch(() => {})
}
```

- Pros: Tight cleanup on every exit path; pairs naturally with #149's overflow guard.
- Cons: `parseSSEStream` signature stays the same but test setup changes slightly.
- Effort: Small.

## Recommended Action

_Pending triage._ Land alongside #149.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [x] Reader is cancelled on every exit path (success, error, exception)
- [x] `recoverFromStreamException` runs on a closed reader, not an orphaned one

## Resolution

Implemented Option A verbatim in `handleConfirmCandidate`
(`src/components/features/ReviewForm.tsx`): acquire the reader once into a
variable, wrap the `for await` in `try`, and `reader.cancel().catch(() => {})` in
`finally`. This covers all three exit paths — normal `done` return, the
error-status return, and a thrown exception (including #149's buffer-overflow
throw). `reader.cancel()` on an already-completed stream is a harmless no-op; the
`.catch(() => {})` swallows the benign "already released" rejection. The outer
`catch → recoverFromStreamException()` now always runs after the reader is
cancelled, not on an orphaned one.

Landed together with #149 (the overflow guard that makes this cancellation
load-bearing on the error path).

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.
_2026-06-03:_ Fixed via reader-into-variable + `finally` cancel; landed alongside #149.
