---
status: pending
priority: p2
issue_id: "086"
tags: [code-review, performance, cost, prompt-caching, ai]
dependencies: []
---

# No Prompt Caching on `PROPOSE_SYSTEM` or `CURATION_SYSTEM` — Missed Cost Optimization

## Problem Statement

`rewriteAsLesson` correctly applies `cache_control: { type: 'ephemeral' }` to the course context block (`src/lib/ai.ts:391`). However, `proposeCourseCandidates` and `curatePostSelection` both pass `system` as a plain string — making neither system prompt cache-eligible.

`PROPOSE_SYSTEM` includes the full `CURATION_SYSTEM` text (~550 chars) plus ~250 chars of additional instructions. These are static strings that never change between calls from the same user session. Caching them would reduce input token cost on the second call (curate) and any retry of propose.

At current scale (single-user tool), the absolute savings are modest. At higher volume or if the system prompts grow with additional context, the savings become meaningful.

## Findings

- `src/lib/ai.ts:231–237` — `system: PROPOSE_SYSTEM` (plain string, not cached)
- `src/lib/ai.ts:113–120` — `system: CURATION_SYSTEM` (plain string, not cached)
- `src/lib/ai.ts:388–396` — `rewriteAsLesson` already uses `cache_control` correctly

**Source:** Performance oracle review

## Proposed Solutions

### Option A — Convert system to structured array with cache_control (Recommended)
```ts
system: [
  {
    type: 'text',
    text: PROPOSE_SYSTEM,
    cache_control: { type: 'ephemeral' },
  },
] as Anthropic.Messages.TextBlockParam[],
```
Apply to both `proposeCourseCandidates` (line 231) and `curatePostSelection` (line 113).

**Pros:** Matches the pattern already used in `rewriteAsLesson`. Reduces cost on repeated calls.
**Cons:** Minor type ceremony (the `as` cast).
**Effort:** Small | **Risk:** None

### Option B — Leave as-is
Accept no caching on system prompts for these calls.

**Effort:** None | **Risk:** Missed cost optimization

## Recommended Action

Option A — apply to both functions. Pattern already exists in the codebase.

## Technical Details

**Affected files:**
- `src/lib/ai.ts:231` (proposeCourseCandidates)
- `src/lib/ai.ts:113` (curatePostSelection)

## Acceptance Criteria

- [ ] Both `proposeCourseCandidates` and `curatePostSelection` use structured `system` arrays with `cache_control`
- [ ] Pattern matches `rewriteAsLesson` style

## Work Log

- 2026-04-04: Found by performance oracle review
