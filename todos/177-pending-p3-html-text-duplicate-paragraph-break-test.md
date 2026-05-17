---
status: pending
priority: p3
issue_id: "177"
tags: [code-review, testing, simplicity]
dependencies: []
---

# `html-text.test.ts` Duplicates Paragraph-Break Coverage Across Two Test Cases

## Problem Statement

Two tests exercise the same property — that `\n\n` survives truncation:

- `extractTextFromHtml … preserves paragraph breaks across the truncation boundary` (lines 42-53)
- `truncateTextToWords … preserves \n\n paragraph breaks within the kept slice` (lines 83-88)

The unit-level test (`truncateTextToWords` directly) is the load-bearing one; the integration test re-proves the same property through `extractTextFromHtml` without testing anything specific to extraction.

Flagged by code-simplicity-reviewer (P2; demoted to p3 since it's only test cleanup).

## Findings

**Location:** `src/lib/__tests__/html-text.test.ts:42-53`

## Proposed Solutions

### Option A: Drop the integration-level duplicate (recommended)

Keep the unit-level test; rely on type-level composition that `extractTextFromHtml` calls `truncateTextToWords`.

- Pros: -12 lines. Single point of failure for the property.
- Cons: A future refactor that moves truncation out of `extractTextFromHtml` could lose paragraph preservation without this test catching it.
- Effort: Trivial.

### Option B: Keep both, mark the integration test with a comment

Document why both exist (defense against the refactor risk above).

- Pros: Documents intent.
- Cons: Comment will be skipped on read.
- Effort: Trivial.

### Option C: Replace the integration test with a smoke check

Reduce it to a one-line assert that `extractTextFromHtml` output contains `\n\n` for a multi-paragraph input — small and focused.

- Pros: Catches the refactor risk without duplicating the truncation property.
- Cons: Tests less.
- Effort: Trivial.

## Recommended Action

_Pending triage._ Option C — keeps the safety net but trims redundancy.

## Technical Details

**Affected files:**
- `src/lib/__tests__/html-text.test.ts`

## Acceptance Criteria

- [ ] Tests are not duplicated; intent of remaining tests is clear

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/lib/__tests__/html-text.test.ts:42-53, 83-88`
