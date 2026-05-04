---
status: pending
priority: p2
issue_id: "157"
tags: [code-review, simplicity, refactor, yagni]
dependencies: []
---

# `recoverFromStreamException` Is A One-Call Helper Around 14 Lines

## Problem Statement

`recoverFromStreamException` is invoked from a single `catch {}` block in `handleConfirmCandidate` and contains ~14 lines of straight-line recovery. The original inline form was self-contained and obvious. Extraction added a name lookup without removing repetition or enabling reuse.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:249-262` (definition), called once at `:306`.

Flagged by kieran-typescript-reviewer (P3-4) — also notes the helper reads from `sessionStorage` rather than the in-scope `inProgressLessons` array, which is its own footgun (see #160).

Flagged by code-simplicity-reviewer (#6) — verdict "inline back into the catch block, or accept it as marginal."

## Proposed Solutions

### Option A: Inline back into the catch

- Pros: Removes the indirection; the recovery logic lives next to where the exception is caught.
- Cons: Reverses last week's refactor.
- Effort: Small.

### Option B: Keep the helper but read from `inProgressLessons` instead of `sessionStorage`

Address only the footgun (#160); leave the extraction as is.

- Pros: Less code churn.
- Cons: Doesn't address the "is this helper earning its keep" question.
- Effort: Small.

### Option C: Accept as is

- Pros: Zero churn.
- Cons: Doesn't compound the refactor's clarity gains.
- Effort: Zero.

## Recommended Action

_Pending triage._ Coordinate with #156 — if the orchestrator collapses to a flatter shape, #157 likely inlines naturally.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [ ] One coherent decision: keep helper (with #160 fix) OR inline.

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- Related: #156, #160
