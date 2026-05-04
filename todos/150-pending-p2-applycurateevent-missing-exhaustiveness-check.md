---
status: pending
priority: p2
issue_id: "150"
tags: [code-review, typescript, reliability, sse]
dependencies: []
---

# `applyCurateEvent` Switch Has No Exhaustiveness Guard

## Problem Statement

`applyCurateEvent` returns `CurateOutcome` from a `switch` over `event.type`. TypeScript's control-flow analysis is satisfied because every case returns, but if a new variant is added to `CurateSSEEvent` and someone forgets to handle it here, the function silently returns `undefined` (typed as `CurateOutcome`). At runtime, `outcome.status === 'done'` will throw a TypeError.

This is also a partial-deploy hazard: a server that emits a future event type while a client is still on the old bundle will crash the loop instead of being ignored.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:218-248`

Flagged by kieran-typescript-reviewer (P2-2) and security-sentinel (P3-3).

## Proposed Solutions

### Option A: Add a `default` arm with `assertNever`

```ts
default: {
  const _exhaustive: never = event
  void _exhaustive
  return { status: 'continue' }
}
```

- Pros: Compile-time guarantee for new variants; runtime fallback for forward-compat.
- Cons: Three-line idiom.
- Effort: Small.

### Option B: Just `return { status: 'continue' }` as default

- Pros: Simpler.
- Cons: Loses compile-time check; hides bugs.
- Effort: Smallest.

## Recommended Action

_Pending triage._ Option A. The `never` trick is the right answer for discriminated unions.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [ ] `applyCurateEvent` rejects compilation when a new `CurateSSEEvent` variant is added without a case
- [ ] `applyCurateEvent` returns a non-undefined value at runtime for unknown event types

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- `src/types/index.ts` — `CurateSSEEvent` discriminated union
