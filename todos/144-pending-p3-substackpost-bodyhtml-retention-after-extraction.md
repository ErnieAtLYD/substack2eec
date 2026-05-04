---
status: pending
priority: p3
issue_id: "144"
tags: [code-review, performance, follow-up, scope-deferred]
dependencies: []
---

# Follow-up: `SubstackPost.bodyHtml` Retained After Extraction (Unused Downstream)

## Problem Statement

`fetchPublicPosts` builds each `SubstackPost` with both `bodyHtml` (full raw HTML) and `bodyText` (extracted plain text). Downstream consumers — `/api/curate`, the AI prompts in `src/lib/ai.ts`, and the export pipeline — only read `bodyText`. The `bodyHtml` field is held in memory for the full request lifetime for no reason. For a 50-post fetch this is ~5–10× the per-post payload that needs to be retained.

## Findings

**Location:**
- `src/lib/substack.ts:120` (`fetchFullPost` returns the `SubstackPost` with `bodyHtml`)
- `src/types/index.ts:8` (the field on the interface)

Flagged by performance-oracle as the only perf lever in this code path with real ROI — outside the scope of the dupes refactor.

## Proposed Solutions

### Option A: Drop `bodyHtml` from `SubstackPost`

- Pros: Significant memory reduction during `/api/fetch-posts` and downstream processing.
- Cons: Any future consumer that wants the raw HTML would need to re-fetch. Verify no current consumer relies on it.
- Effort: Small (delete the field, update the interface, run typecheck).

### Option B: Make `bodyHtml` optional and stop populating it

- Pros: Backward-compatible if a consumer is later added.
- Cons: Half-measure; YAGNI says delete.
- Effort: Small.

## Recommended Action

_Pending triage._ Verify no consumers via `grep -rn "bodyHtml" src/` first.

## Technical Details

**Affected files:**
- `src/lib/substack.ts`
- `src/types/index.ts`

## Acceptance Criteria

- [ ] Confirmed no consumer reads `SubstackPost.bodyHtml`
- [ ] Field removed from interface
- [ ] `tsc --noEmit` and full test suite pass

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor (out-of-scope follow-up).

## Resources

- performance-oracle review (this review)
