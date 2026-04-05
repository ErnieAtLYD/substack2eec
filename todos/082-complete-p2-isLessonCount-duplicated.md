---
status: pending
priority: p2
issue_id: "082"
tags: [code-review, simplicity, duplication, typescript]
dependencies: [080]
---

# `isLessonCount` Type Guard Duplicated in Both Route Files

## Problem Statement

The `isLessonCount` type guard is byte-for-byte identical in both route files:

```ts
function isLessonCount(value: unknown): value is LessonCount {
  return (ALLOWED_LESSON_COUNTS as ReadonlyArray<unknown>).includes(value)
}
```

- `src/app/api/curate/route.ts:46–48`
- `src/app/api/propose-courses/route.ts:26–28`

`ALLOWED_LESSON_COUNTS` and `LessonCount` already live in `src/types/index.ts`. The type guard should be exported from there alongside the constant and type.

## Findings

- Identical 3-line function in both routes
- `ALLOWED_LESSON_COUNTS` already in `src/types/index.ts` — natural home for the guard

**Source:** TypeScript reviewer, simplicity reviewer

## Proposed Solutions

### Option A — Export from `src/types/index.ts` (Recommended)
Add to `src/types/index.ts`:
```ts
export function isLessonCount(value: unknown): value is LessonCount {
  return (ALLOWED_LESSON_COUNTS as ReadonlyArray<unknown>).includes(value)
}
```
Remove from both route files and import.

**Effort:** Small | **Risk:** None

### Option B — Inline the check as a Zod refinement
Replace `isLessonCount` with a Zod union at schema level:
```ts
lessonCount: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]).optional()
```
No type guard needed.

**Effort:** Small | **Risk:** None — eliminates the guard entirely

## Recommended Action

Option B in propose-courses (already optional, natural fit for Zod union), Option A export for curate which has post-parse usage.

## Technical Details

**Affected files:**
- `src/types/index.ts` (export guard or note)
- `src/app/api/curate/route.ts:46–48` (remove)
- `src/app/api/propose-courses/route.ts:26–28` (remove)

## Acceptance Criteria

- [ ] `isLessonCount` defined in exactly one place
- [ ] Both routes use the single shared definition

## Work Log

- 2026-04-04: Found by TypeScript and simplicity reviewers
