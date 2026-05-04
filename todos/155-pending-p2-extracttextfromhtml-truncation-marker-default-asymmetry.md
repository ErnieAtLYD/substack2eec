---
status: pending
priority: p2
issue_id: "155"
tags: [code-review, design, llm-input]
dependencies: []
---

# `extractTextFromHtml` Truncation-Marker Default Is Asymmetric

## Problem Statement

The new `ExtractTextOptions.truncationMarker` defaults to `''` (empty). The LLM-facing caller (`src/lib/substack.ts`) passes no options, so truncated bodies reach the model with **no signal** that they were cut off. The human-facing CLI (`spike/extract.ts`) opts in to `'\n\n[truncated]'` and gets the marker.

The asymmetry is backwards: the LLM is the consumer most helped by knowing "more existed below this point." Without the marker, the model is just told "here is a post" and given a body that ends mid-thought, which has been observed in prior runs to cause the model to fabricate a wrap-up rather than note the truncation.

Note: this is **not** a regression from main — `src/lib/substack.ts` on main never appended a marker either. But it remains a quality issue that this refactor is the right moment to fix.

## Findings

**Locations:**
- `src/lib/html-text.ts:48` — `return candidate + (options.truncationMarker ?? '')`
- `src/lib/substack.ts:81` — `extractTextFromHtml(post.body_html)` (no options)
- `spike/extract.ts:91` — passes `'\n\n[truncated]'`

Flagged by code-simplicity-reviewer (#2). Behavior preservation confirmed by kieran-typescript-reviewer.

## Proposed Solutions

### Option A: Make `'\n\n[truncated]'` the default; drop the option

`extractTextFromHtml(html: string): string` — both callers get the marker. `src/lib/ai.ts` already `xmlEscape`s the body, so the marker survives as plain text inside `<bodyText>` (no XML break-out risk).

- Pros: LLM gets the better signal. Fewer interfaces. Closes simplicity finding #1 (interface overkill, todo #140).
- Cons: Slight behavior change in the LLM prompt — should be validated with at least one curate run.
- Effort: Small.

### Option B: Invert the option to opt-out

`extractTextFromHtml(html, { omitTruncationMarker?: true })` — `substack.ts` defaults safely; spike still works without a marker config.

- Pros: Same end state with explicit override.
- Cons: A negative-named flag.
- Effort: Small.

### Option C: Keep current asymmetry; document it

- Pros: No behavior change.
- Cons: Asymmetry remains; the LLM still ends up with mid-sentence truncation.
- Effort: Negligible.

## Recommended Action

_Pending triage._ Lean toward Option A. Validate with one end-to-end curate call to confirm the model handles the marker gracefully.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`
- `src/lib/substack.ts`
- `spike/extract.ts`

If Option A is chosen, also resolves todos #140 and #142.

## Acceptance Criteria

- [ ] Truncated `bodyText` reaching `/api/curate` includes a truncation signal
- [ ] LLM curate run completes without the model fabricating a continuation past `[truncated]`

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- `todos/140-pending-p2-html-text-options-interface-overkill.md`
- `todos/142-pending-p3-spike-truncation-marker-const-not-needed.md`
