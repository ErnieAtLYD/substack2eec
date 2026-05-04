---
status: complete
priority: p1
issue_id: "148"
tags: [code-review, testing, quality]
dependencies: []
---

# New `src/lib/html-text.ts` Module Ships With No Tests

## Problem Statement

The whole point of extracting `extractTextFromHtml` into its own module was to make it testable in isolation. The `parseSSEStream` extraction got a dedicated test file (`src/components/features/__tests__/parseSSEStream.test.ts`); `html-text.ts` did not. Several non-obvious behaviors deserve to be pinned by tests.

## Findings

**Location:** `src/lib/html-text.ts` (new file, no `__tests__/` companion)

Behaviors worth testing:
- Truncation walks back to last `. `/`! `/`? `; if no sentence boundary found in first 2,500 words, returns raw word slice.
- `lastSentenceEnd > 0` (strict `>`) — a sentence ending at index 0 would be ignored. Edge case.
- `truncationMarker` is appended **only** when truncation occurs (not on short posts).
- Empty/whitespace-only HTML.
- HTML at exactly `MAX_POST_WORDS`.
- Noise selectors (`.subscribe-widget`, `figure`, `.tweet`, etc.) actually removed.
- Paragraph break preservation (related to todo #147).

Flagged by kieran-typescript-reviewer (P1-3).

## Proposed Solutions

### Option A: Add `src/lib/__tests__/html-text.test.ts` with 6–8 vitest cases

Mirror the structure of `parseSSEStream.test.ts`. Cases above.

- Pros: Locks behavior; gives confidence for follow-on changes (#147, #155).
- Cons: ~40 lines of test code.
- Effort: Small.

## Recommended Action

_Pending triage._ Land before #147 / #155 so those refactors have a regression net.

## Technical Details

**Affected files:**
- `src/lib/__tests__/html-text.test.ts` (new)

## Acceptance Criteria

- [ ] At least 6 cases covering: untruncated short HTML, truncation with sentence boundary, truncation without sentence boundary, marker appended on truncate, no marker on short, noise-selector removal, paragraph break preservation
- [ ] `npm test` runs them in the existing vitest config

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.
_2026-05-04:_ Resolved in commit 5322d56. Added `src/lib/__tests__/html-text.test.ts` with 13 cases covering `extractTextFromHtml` (block-element paragraph breaks, noise-selector removal, marker semantics, paragraph preservation across the truncation boundary, empty input) and `truncateTextToWords` (under cap, exactly at cap, sentence-boundary walkback, no-boundary fallback, marker conditional, paragraph preservation, empty input).

## Resources

- `src/components/features/__tests__/parseSSEStream.test.ts` (precedent)
