---
status: pending
priority: p3
issue_id: "190"
tags: [code-review, quality]
dependencies: []
---

# PR #33 review polish batch (redundant guards, comment accuracy, log prefix)

Bundle of small nice-to-have polish items from the PR #33 review — none affect behavior.

## Problem Statement / Findings

1. **Redundant route guards** (`route.ts` lesson loop): of the three `if (signal.aborted) break` checks, only the top-of-loop one is load-bearing in production — the SDK *throws* on abort, so the in-chunk-loop and pre-parse checks are belt-and-suspenders that only the test's yield-then-hang mock exercises. Defensible defensive code; could drop two checks (and adjust the mock to throw) for the most honest shape. (code-simplicity Q1)
2. **`enqueue` double-gate vs comment**: `if (closed || signal.aborted)` is two guards but the comment says "one guard covers both"; `|| signal.aborted` is a micro-optimization, not required for correctness. Either drop the clause or fix the comment. (code-simplicity Q2)
3. **Empty abort branch**: `if (signal.aborted) { /* comment */ } else { ... }` in the route catch — invert to `if (!signal.aborted) { ... }` with the comment on the guard. (code-simplicity Q4)
4. **Log prefix consistency**: client logs `'curate stream failed:'`, route logs `'[curate] stream error:'` — match the `[curate]` prefix for cross-side grepping. (kieran-typescript)
5. **Verbose `finally` comment** (`ReviewForm.tsx`): trims to the load-bearing half; the "can never inject into the catch" clause restates JS semantics. (code-simplicity Q4)
6. **Test fixture clarity** (`curate-route-abort.test.ts`): `lessonCount: 5` with a 2-lesson selection fixture — add a one-line comment that lessonCount is ignored when the mock selection drives the loop. (kieran-typescript)

## Proposed Solutions

### Option 1: Apply all six in one pass

**Effort:** 30 min | **Risk:** Low

### Option 2: Apply only the comment-accuracy items (2, 4, 6)

**Effort:** 10 min | **Risk:** Low — keeps the defensive guards as-is

## Recommended Action

**To be filled during triage.**

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts`
- `src/components/features/ReviewForm.tsx`
- `src/__tests__/curate-route-abort.test.ts`

## Resources

- **PR:** #33
- **Reviewers:** code-simplicity-reviewer (Q1, Q2, Q4), kieran-typescript-reviewer (nits 2-3)

## Acceptance Criteria

- [ ] Chosen subset applied; comments match code behavior
- [ ] All tests green; no behavior change

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #33)
