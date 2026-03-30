---
status: pending
priority: p1
issue_id: "045"
tags: [code-review, typescript, type-safety]
dependencies: []
---

# `isLessonCount` Type Guard Uses Circular Unsafe Cast

## Problem Statement

The `isLessonCount` type predicate in `/api/curate/route.ts` casts `value` to `LessonCount` *before* checking it, making the guard circular: it asserts the type to do the check that is supposed to establish the type. This is semantically wrong.

## Findings

**Location:** `src/app/api/curate/route.ts:30-32`

```typescript
function isLessonCount(value: unknown): value is LessonCount {
  return ALLOWED_LESSON_COUNTS.includes(value as LessonCount)
}
```

The cast `value as LessonCount` is needed because `ReadonlyArray<T>.includes` only accepts `T`. But the workaround asserts the type before verifying it — the very thing the function is supposed to do. At runtime this works because the `includes` check does the right thing, but the TypeScript is logically wrong and could confuse future maintainers.

## Proposed Solutions

### Option A: Cast the array, not the value (Recommended)
```typescript
function isLessonCount(value: unknown): value is LessonCount {
  return (ALLOWED_LESSON_COUNTS as ReadonlyArray<unknown>).includes(value)
}
```
Widening the array type to `ReadonlyArray<unknown>` is semantically correct: we are asking "is this unknown value in this known set?" rather than "is this known value in this set?"

- **Pros:** No unsafe cast; standard TypeScript pattern for this scenario
- **Effort:** Tiny
- **Risk:** None

### Option B: Move validation into Zod schema
```typescript
lessonCount: z.number().refine(
  n => ALLOWED_LESSON_COUNTS.includes(n as LessonCount),
  { message: 'Invalid lesson count' }
).default(5),
```
Then remove `isLessonCount` entirely.
- **Pros:** Validation at the boundary, less code
- **Cons:** Loses the default-to-5 fallback behavior (Zod `.default()` applies to missing fields, not invalid values; would need `.catch(5)` instead)
- **Effort:** Small

## Recommended Action

Option A. One-character change: cast the array, not the value.

## Technical Details

**Affected file:** `src/app/api/curate/route.ts:30-32`

## Acceptance Criteria

- [ ] `isLessonCount` uses `(ALLOWED_LESSON_COUNTS as ReadonlyArray<unknown>).includes(value)` or equivalent
- [ ] No unsafe cast on `value` inside the type guard
- [ ] `npx tsc --noEmit` passes

## Work Log

- 2026-03-29: Found during TypeScript review of batch fixes (round 2)
