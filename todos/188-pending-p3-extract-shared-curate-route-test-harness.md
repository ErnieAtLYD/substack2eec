---
status: pending
priority: p3
issue_id: "188"
tags: [code-review, quality, testing]
dependencies: []
---

# Extract shared curate-route test harness (duplicated across two files, n=3 imminent)

`curate-route-abort.test.ts` and `curate-route-error-log.test.ts` share ~40 lines of byte-identical or near-identical harness.

## Problem Statement

Duplicated across both files: the entire `vi.mock('server-only')` + `vi.mock('@/lib/ai')` block (15 lines, identical), `parseSseEvents` (identical), `postFixture` (near-identical), the `request` builder, and the `beforeEach` (resetModules/restoreAllMocks/dynamic-import POST). This is a whole reusable harness — "set up the curate route with a mocked AI layer and parse its SSE output" — not incidental n=2 similarity. The next curate-route test guarantees a third copy.

## Findings

- code-simplicity-reviewer (the one finding it rated "important" in PR #33): extraction removes ~35 lines now and prevents the n=3 copy
- Abort-specific helpers (`abortError`, `rejectOnAbort`) are genuinely unique and stay in the abort file

## Proposed Solutions

### Option 1: Shared harness module

**Approach:** `src/__tests__/helpers/curate-route-harness.ts` exporting `parseSseEvents`, `postFixture(slug?)`, `makeRequest(body, signal?)`, and the mock fns + a `setupCurateRouteMocks()` (note: `vi.mock` is hoisted per-file, so the mock *declaration* may need to stay in each file while fixtures/parsers/builders move — verify what vitest allows and extract the maximum that works).

**Pros:** Single harness, smaller files, no third copy
**Cons:** `vi.mock` hoisting constrains how much of the mock block can move
**Effort:** 1 hour
**Risk:** Low

### Option 2: Leave as-is until the third test appears

**Pros:** Zero churn now
**Cons:** The third copy is predictable (deferred work, same cost later)
**Effort:** 0
**Risk:** Low

## Recommended Action

**To be filled during triage.**

## Technical Details

**Affected files:**
- `src/__tests__/curate-route-abort.test.ts`
- `src/__tests__/curate-route-error-log.test.ts`
- new `src/__tests__/helpers/curate-route-harness.ts`

## Resources

- **PR:** #33
- **Reviewer:** code-simplicity-reviewer (Q5)

## Acceptance Criteria

- [ ] Shared fixtures/parsers/builders live in one module
- [ ] Both test files import it; all tests green
- [ ] Abort-specific helpers remain local to the abort file

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #33 — code-simplicity-reviewer)
