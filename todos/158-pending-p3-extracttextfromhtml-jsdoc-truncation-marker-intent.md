---
status: pending
priority: p3
issue_id: "158"
tags: [code-review, documentation]
dependencies: []
---

# `extractTextFromHtml` Lacks JSDoc Explaining `truncationMarker` Intent

## Problem Statement

The `truncationMarker` option has a non-obvious purpose: production callers want LLM-clean output (no `[truncated]` token to confuse the model), while the human-facing spike CLI wants a visible truncation signal. Without a doc comment, the next reader will reasonably ask "why is the marker optional?" — the same question the review prompt asked.

May be obviated if #155 lands (default flips to always-on; option deleted entirely).

## Findings

**Location:** `src/lib/html-text.ts:23-48`

Flagged by kieran-typescript-reviewer (P1-2).

## Proposed Solutions

### Option A: Add JSDoc on `extractTextFromHtml` and `ExtractTextOptions`

```ts
/**
 * Extracts plain text from a Substack post body HTML.
 * Strips Substack chrome (subscribe widgets, footers, figures), preserves
 * paragraph breaks, and truncates to MAX_POST_WORDS at the last sentence
 * boundary.
 *
 * @param truncationMarker  Appended to truncated output. Default `''` keeps
 *                          LLM input clean; CLI/debug callers can pass
 *                          `'\n\n[truncated]'` to make truncation visible.
 */
```

- Pros: Documents the seam.
- Cons: Becomes stale if #155 changes the default.
- Effort: Small.

## Recommended Action

_Pending triage._ Skip if #155 lands. Otherwise add.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`

## Acceptance Criteria

- [ ] JSDoc explains both the function and the option's purpose

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- Related: #155
