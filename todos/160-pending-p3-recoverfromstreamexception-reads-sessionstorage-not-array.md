---
status: pending
priority: p3
issue_id: "160"
tags: [code-review, refactor, footgun]
dependencies: ["157"]
---

# `recoverFromStreamException` Reads From `sessionStorage`, Not In-Scope Array

## Problem Statement

`recoverFromStreamException` reads partial lessons by pulling them back out of `sessionStorage`, even though the local `inProgressLessons` array is in scope at the catch site (`handleConfirmCandidate:275`). It works because every `lesson_done` writes to session storage immediately, but this couples the recovery path to a hidden invariant: any future event-handling change that forgets to persist breaks recovery silently.

The in-scope array is the more direct source of truth.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:249-262`

Flagged by kieran-typescript-reviewer (P3-4).

## Proposed Solutions

### Option A: Pass `inProgressLessons` into `recoverFromStreamException`

- Pros: Removes the implicit dependency on session-storage write-through.
- Cons: One more parameter.
- Effort: Small.

### Option B: Inline back into the catch (covered by #157)

If #157 lands as inline, this finding dissolves — the `inProgressLessons` array is already in scope.

## Recommended Action

_Pending triage._ Resolves naturally if #157 inlines.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [ ] Recovery path no longer depends on session-storage write-through being correct

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- Related: #157
