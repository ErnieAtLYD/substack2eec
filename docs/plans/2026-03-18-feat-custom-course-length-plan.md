---
title: "feat: Custom course length picker (3, 5, 7, or 10 lessons)"
type: feat
status: completed
date: 2026-03-18
---

# feat: Custom course length picker (3, 5, 7, or 10 lessons)

## Overview

Let users choose how many lessons their email course contains before generation begins. Currently the number is hardcoded to 5 throughout the AI prompts, tool schema, and UI. This change threads a `lessonCount` parameter from a radio picker in the input step through the full pipeline.

## Problem Statement

The lesson count of 5 is hardcoded in 6 places across 3 files. There is no way for a user to request a shorter (3-lesson) course for a thin archive or a longer (7 or 10-lesson) course for a rich one. The hardcoded value also bleeds into the Claude prompts, making the AI unaware it should plan for a different arc length.

## Proposed Solution

Add a radio button group (3 / 5 / 7 / 10) to the input step, default 5. Pass the selected count through the API and into the AI functions. All downstream code already iterates dynamically — only the prompt-generation and type definitions need touching.

## Technical Approach

### Files to Change

| File | Location | Change |
|---|---|---|
| `src/types/index.ts` | `CurateRequest` (line 48) | Add `lessonCount: number` field |
| `src/lib/ai.ts` | `CURATION_TOOL` schema (lines 31, 37) | `maxItems` and `maximum` become `lessonCount` param |
| `src/lib/ai.ts` | `CURATION_SYSTEM` prompt (line 58) | Replace `"by lesson 5"` → `"by the final lesson"` |
| `src/lib/ai.ts` | `curatePostSelection()` (line 88) | Add `lessonCount: number` param; use in prompt |
| `src/lib/ai.ts` | `LESSON_SCHEMA` constant (line 163) | Replace `"omit on lesson 5"` → `"omit on the final lesson"` |
| `src/app/api/curate/route.ts` | Request body parsing | Extract `lessonCount`, pass to `curatePostSelection()` |
| `src/components/features/ReviewForm.tsx` | Input step (line 263) | Add radio group; include `lessonCount` in curate POST body |
| `src/components/features/ReviewForm.tsx` | Subtitle text (line 266) | Show chosen count dynamically |
| `src/components/features/ReviewForm.tsx` | Review warning (line 325) | Replace hardcoded `5` with `lessonCount` state |

### Files With No Changes

- `src/app/api/fetch-posts/route.ts` — always fetches up to 50 posts regardless
- `src/app/api/export/route.ts` — iterates whatever lessons array it receives
- `src/lib/export.ts` — fully agnostic to count
- `src/lib/substack.ts` — fetches a pool; unrelated to lesson count

### Token Budget

The current `max_tokens: 4096` in `curatePostSelection()` is safe for 10 lessons (~3,500 tokens worst case). **Do not reduce `max_tokens`** — the solutions doc (`docs/solutions/runtime-errors/anthropic-tool-use-max-tokens-truncation.md`) documents what happens when curation responses truncate silently.

The existing `stop_reason === 'max_tokens'` guard and `Array.isArray(raw.lessons)` check in `ai.ts` already protect against truncation — no new guards needed, just keep them.

### UI Design

Radio group in the input step, inline with the URL field:

```
[ Substack URL input field         ] [Generate Course]

Course length:  ○ 3   ● 5   ○ 7   ○ 10 lessons
```

Default: 5 (preserves current behavior for existing users).

## System-Wide Impact

- **Interaction graph:** `lessonCount` flows: UI state → curate POST body → `CurateRequest` → route handler → `curatePostSelection(posts, lessonCount)` → Claude tool schema → `CuratedSelection.lessons[]` length. Downstream (`rewriteAsLesson`, `buildZip`) already reads `selection.lessons.length` dynamically — no changes needed there.
- **State lifecycle:** `lessonCount` is ephemeral UI state. If the user refreshes mid-generation, `sessionStorage` already saves lessons as they arrive — the count is implicit in the saved array length. No need to persist `lessonCount` separately.
- **Error propagation:** The existing `stop_reason` guard throws on truncation. The existing shape guard (`!Array.isArray(raw.lessons)`) catches malformed responses. Both remain intact.

## Acceptance Criteria

- [x] Input step shows a radio group with options 3, 5, 7, 10 — defaulting to 5
- [x] Selected `lessonCount` is sent in the `/api/curate` POST body
- [x] Claude's curation tool schema uses `lessonCount` for `maxItems` and `maximum`
- [x] Claude's curation prompt explicitly names the desired count
- [x] The subtitle and review-step warning reflect the chosen count, not a hardcoded 5
- [x] `CurateRequest` type includes `lessonCount: number`
- [x] `max_tokens: 4096` in `curatePostSelection()` is preserved (not reduced)
- [x] Existing `stop_reason` and `Array.isArray` guards remain in place
- [x] Choosing 5 lessons produces identical behavior to the current app

## Dependencies & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 10-lesson generation exceeds Vercel's 180s timeout | Low | `maxDuration = 180` already set; 10 lessons × ~15s/lesson = ~150s; acceptable |
| Claude ignores the count and returns fewer/more lessons | Low | Tool schema `maxItems` + prompt are the enforcement mechanisms; existing sort + slice is a last resort |
| Token budget exceeded for 10 lessons | Very Low | 4096 max_tokens has ~600 token headroom; guard already in place |

## Sources & References

- Hardcoded values: `src/lib/ai.ts:31,37,58,88,163`
- Type definition: `src/types/index.ts:48`
- UI text: `src/components/features/ReviewForm.tsx:266,325`
- Token truncation learnings: `docs/solutions/runtime-errors/anthropic-tool-use-max-tokens-truncation.md`
- Future considerations origin: `docs/plans/2026-03-14-feat-substack-to-eec-web-app-plan.md` (line 498)
