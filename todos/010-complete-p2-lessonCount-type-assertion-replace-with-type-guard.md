---
status: done
priority: p2
issue_id: "010"
tags: [code-review, typescript, type-safety]
dependencies: []
---

# Replace `as LessonCount` Assertion with a `isLessonCount` Type Guard

## Problem Statement

The `lessonCount` allowlist check in `route.ts` uses a double type assertion that the TypeScript compiler cannot verify:

```typescript
const lessonCount: LessonCount = (ALLOWED_LESSON_COUNTS as readonly number[]).includes(body.lessonCount as number)
  ? body.lessonCount as LessonCount
  : 5
```

The `as LessonCount` on the true branch is an assertion, not a compiler-proved narrowing. TypeScript accepts it because `LessonCount` and `number` overlap, but it provides no guarantee that `body.lessonCount` is actually one of `3 | 5 | 7 | 10`. If `ALLOWED_LESSON_COUNTS` or `LessonCount` diverged (e.g., someone adds `15` to the array but forgets to update the type), the assertion would still compile and pass a wrong value silently.

A type predicate (`value is LessonCount`) gives the compiler a real narrowing proof instead of a suppression.

**Secondary issue:** The double-cast form `(ALLOWED_LESSON_COUNTS as readonly number[]).includes(body.lessonCount as number)` is more verbose than needed. The simpler `ALLOWED_LESSON_COUNTS.includes(body.lessonCount as LessonCount)` achieves the same runtime check with one less cast.

## Findings

**Location:** `src/app/api/curate/route.ts:38-41`

```typescript
const lessonCount: LessonCount = (ALLOWED_LESSON_COUNTS as readonly number[]).includes(body.lessonCount as number)
  ? body.lessonCount as LessonCount
  : 5
```

- TypeScript reviewer: "This is the most significant issue — replace with a `value is LessonCount` type guard"
- Simplicity reviewer: "The argument-cast form is shorter and more obvious"

## Proposed Solutions

### Option A: Type predicate function (Recommended)
```typescript
// In src/types/index.ts or inline in route.ts:
function isLessonCount(value: unknown): value is LessonCount {
  return ALLOWED_LESSON_COUNTS.includes(value as LessonCount)
}

// In route.ts:
const lessonCount = isLessonCount(body.lessonCount) ? body.lessonCount : 5
```
- **Pros:** TypeScript narrows `body.lessonCount` to `LessonCount` on the true branch — no assertion needed; compiler-verified
- **Cons:** Adds one function (3 lines); `ALLOWED_LESSON_COUNTS.includes(value as LessonCount)` still uses a cast internally, but it's confined to the guard
- **Effort:** Small
- **Risk:** None

### Option B: Simpler argument-cast (less strict but cleaner)
```typescript
const lessonCount: LessonCount = ALLOWED_LESSON_COUNTS.includes(body.lessonCount as LessonCount)
  ? body.lessonCount as LessonCount
  : 5
```
- **Pros:** One fewer cast than current; fits on fewer lines; still runtime-safe
- **Cons:** Still an assertion on the true branch — TypeScript doesn't narrow; same maintenance risk
- **Effort:** Tiny (3-word change)
- **Risk:** None

## Recommended Action

Option A — type predicate. If the predicate is only used in `route.ts`, define it inline there. If it would also be useful in `ReviewForm.tsx` (e.g., for a future guard on user input), export it from `src/types/index.ts` alongside the type definition.

## Technical Details

**Affected file:** `src/app/api/curate/route.ts:38-41`

## Acceptance Criteria

- [ ] `body.lessonCount` is narrowed to `LessonCount` by a type predicate (not an assertion)
- [ ] No `as LessonCount` cast in the main body of the route handler
- [ ] Build passes cleanly
- [ ] Runtime behavior unchanged (`undefined` and out-of-range values still fall back to `5`)

## Work Log

- 2026-03-18: Found during security fix review of feat/custom-course-length

## Resources

- TypeScript reviewer finding: "P1 — double `as` cast provides no compiler guarantee; use type predicate"
- Simplicity reviewer finding: "P1 — argument-cast over array-widening cast; simpler form available"
