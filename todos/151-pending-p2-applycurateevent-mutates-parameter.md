---
status: pending
priority: p2
issue_id: "151"
tags: [code-review, refactor, purity]
dependencies: []
---

# `applyCurateEvent` Mutates Its Input Array

## Problem Statement

`applyCurateEvent` calls `inProgressLessons.push(event.lesson)` (line ~231), mutating an array passed in by the caller. It works because `handleConfirmCandidate` creates the array and threads the same reference through the SSE loop, but the helper now has a hidden side effect on a parameter, which:

- Couples caller and callee through an implicit invariant.
- Makes the helper hard to test in isolation (must construct a mutable array, call, and assert post-call).
- Reads as the seam where the helper's apparent purity breaks down.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:218-235` (the `lesson_done` case)

Flagged by kieran-typescript-reviewer (P2-3).

## Proposed Solutions

### Option A: Return the lesson; let the caller append

`applyCurateEvent` returns `{ status: 'continue', appendLesson?: GeneratedLesson }`. Caller does `inProgressLessons.push(outcome.appendLesson)`.

- Pros: Helper becomes pure; trivially testable.
- Cons: Slightly more verbose at call site.
- Effort: Small.

### Option B: Move ownership of `inProgressLessons` into a small state machine helper

Encapsulate the array, the session-storage write, and the lesson-done branch in one place.

- Pros: Strong cohesion.
- Cons: New abstraction.
- Effort: Medium.

### Option C: Inline the helper back into `handleConfirmCandidate`

If the helper is mutating caller state anyway, the extraction may not be earning its keep. See also #157 about `recoverFromStreamException`.

- Pros: Removes the seam.
- Cons: Reverses last week's refactor.
- Effort: Small.

## Recommended Action

_Pending triage._ Option A is the minimum fix.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [ ] `applyCurateEvent` does not mutate any of its parameters
- [ ] Caller updates `inProgressLessons` from the helper's return value

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.
