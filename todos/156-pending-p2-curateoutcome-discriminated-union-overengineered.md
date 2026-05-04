---
status: pending
priority: p2
issue_id: "156"
tags: [code-review, simplicity, refactor, yagni]
dependencies: []
---

# `CurateOutcome` Discriminated Union Pads Most Cases With `'continue'`

## Problem Statement

`applyCurateEvent` handles 6 SSE event types and returns `CurateOutcome` — a tagged union of `'continue' | 'done' | 'error'`. Four of six cases return `{ status: 'continue' }` with nothing else; only `done` and `error` carry payload. The caller threads the outcome through to handle just those two terminal states.

The discriminated-union shape obscures the simpler reality: this is a state-machine helper that runs side effects and signals "keep going / stop with lessons / stop with error."

## Findings

**Location:** `src/components/features/ReviewForm.tsx:213-247`

Flagged by code-simplicity-reviewer (#5).

## Proposed Solutions

### Option A: Helper returns `'done' | 'error' | undefined`

`undefined` for "continue, no terminal state." Caller checks `if (outcome) ...`.

- Pros: Removes the `'continue'` arm and the four pad-returns.
- Cons: `undefined` as a control signal is slightly less readable than a tag.
- Effort: Small.

### Option B: Inline `done`/`error` handling in the for-loop, helper handles only side-effecting cases

```ts
for await (const event of parseSSEStream(reader)) {
  if (event.type === 'done') { /* ... */ break }
  if (event.type === 'error') { /* ... */ break }
  applySideEffectingEvent(event, ...)  // selection, lesson_start, lesson_done, lesson_chunk
}
```

- Pros: Locality — terminal logic stays where the caller's state is.
- Cons: Slightly larger inline switch.
- Effort: Small-Medium.

### Option C: Keep the union (current shape)

- Pros: Readable status strings.
- Cons: Padding noise.
- Effort: Zero.

## Recommended Action

_Pending triage._ Likely Option B — most cohesion gain. Coordinate with #151 (param mutation) and #157 (one-call helper inline) so the orchestrator refactor settles into a single coherent shape.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [ ] No "padded" return values — every return carries information
- [ ] Caller code reads more directly to a reader

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- code-simplicity-reviewer review (this review)
- Related: #151, #157
