---
status: pending
priority: p3
issue_id: "095"
tags: [code-review, simplicity, style, consistency]
dependencies: []
---

# `buildProposeCandidatesTool` Uses Named Local Variables Inconsistently With `buildCurationTool`

## Problem Statement

`buildProposeCandidatesTool` in `src/lib/ai.ts:152–195` extracts `lessonItemSchema` and `candidateSchema` as named local variables before assembling the tool definition. `buildCurationTool` (the older counterpart at `ai.ts:31`) inlines all schema objects directly.

The extraction in `buildProposeCandidatesTool` is cosmetic — `lessonItemSchema` and `candidateSchema` are each referenced only once. This creates an inconsistency: one function is dense/inline, the other is extracted. Future maintainers will wonder if there's a reason for the difference.

## Findings

- `src/lib/ai.ts:155–165` — `lessonItemSchema`, `candidateSchema` local vars (used once each)
- `src/lib/ai.ts:31–55` — `buildCurationTool` inlines everything

**Source:** Simplicity reviewer

## Proposed Solutions

### Option A — Inline the schemas in `buildProposeCandidatesTool`
Match the `buildCurationTool` style for consistency.

**Effort:** Small | **Risk:** None

### Option B — Extract schemas in `buildCurationTool` too
Apply the extracted-variable pattern consistently across both functions.

**Effort:** Small | **Risk:** None

### Option C — Leave as-is
Both functions work; style inconsistency is cosmetic.

**Effort:** None | **Risk:** None

## Recommended Action

Option A or C — not worth blocking merge over. Fix if touching the file for other reasons.

## Technical Details

**Affected files:**
- `src/lib/ai.ts:152–195`

## Acceptance Criteria

- [ ] `buildProposeCandidatesTool` and `buildCurationTool` use a consistent style for schema assembly

## Work Log

- 2026-04-04: Found by simplicity reviewer
