---
status: pending
priority: p3
issue_id: "093"
tags: [code-review, security, validation]
dependencies: [080]
---

# `wordCount` Accepts Unbounded Numbers Including NaN and Infinity

## Problem Statement

Both route schemas accept `wordCount: z.number()` with no min/max. This value is inserted into the curation prompt:

```ts
`    words: ${p.wordCount}`,
// src/lib/ai.ts:95
```

Submitting `wordCount: NaN` serializes as `null` in JSON (JSON.stringify converts NaN to null), so the prompt receives `"words: null"`. Submitting `wordCount: Infinity` also serializes as `null`. These values subtly corrupt the model's input signal without causing errors.

Negative values (`wordCount: -9999`) and absurdly large values (`wordCount: 999999999`) are also accepted and forwarded to the prompt.

## Findings

- `src/app/api/curate/route.ts:33` — `wordCount: z.number()`
- `src/app/api/propose-courses/route.ts:18` — `wordCount: z.number()`
- `src/lib/ai.ts:95` — `words: ${p.wordCount}` in prompt

**Source:** Security sentinel review

## Proposed Solutions

### Option A — Add `.int().min(0).max(100_000)` constraint (Recommended)
```ts
wordCount: z.number().int().min(0).max(100_000)
```
`MAX_POST_WORDS = 2500` means legitimate values are well under 100,000. The constraint also ensures no NaN/Infinity slip through (Zod's `.number()` rejects NaN/Infinity by default, but `.int()` makes this explicit).

**Effort:** Trivial | **Risk:** None

## Recommended Action

Option A — add to both schemas. Pairs with todo 080 (shared post schema).

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts:33`
- `src/app/api/propose-courses/route.ts:18`

## Acceptance Criteria

- [ ] `wordCount` has `.int().min(0).max(100_000)` in both schemas
- [ ] Request with `wordCount: NaN` is rejected

## Work Log

- 2026-04-04: Found by security sentinel
