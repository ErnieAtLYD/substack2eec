---
status: pending
priority: p1
issue_id: "077"
tags: [code-review, typescript, validation, ai-output]
dependencies: []
---

# Unsafe `as CuratedLesson[]` Cast on Unvalidated AI Output in `proposeCourseCandidates`

## Problem Statement

In `proposeCourseCandidates` (`src/lib/ai.ts:263`), lesson arrays from Claude's tool-use response are cast directly to `CuratedLesson[]` without field-level validation:

```ts
lessons: (c.lessons as CuratedLesson[])
  .slice()
  .sort((a, b) => a.sequencePosition - b.sequencePosition),
```

`c` is typed as `Record<string, unknown>`. While `Array.isArray(c.lessons)` is checked (line 256), the *elements* are never validated. If Claude returns a lesson object with a missing or non-numeric `sequencePosition`, the `.sort()` produces `NaN` comparisons and silently yields an incorrect sort order — no error thrown, bad output silently propagated to the client.

This same weak pattern exists in the older `curatePostSelection` but is now compounded across 3 candidates × N lessons each.

## Findings

- `src/lib/ai.ts:263` — `(c.lessons as CuratedLesson[])` — no element validation
- `src/lib/ai.ts:256` — only `Array.isArray(c.lessons)` is checked
- `src/lib/ai.ts:265` — `.sort((a, b) => a.sequencePosition - b.sequencePosition)` will produce NaN if sequencePosition is missing
- Analogous issue exists in `curatePostSelection` at `ai.ts:138`

**Source:** TypeScript reviewer, security sentinel (A08 — Data Integrity)

## Proposed Solutions

### Option A — Add Zod parse at the boundary (Recommended)
Import or reuse `CuratedSelectionSchema` from `curate/route.ts` (or a shared schemas file) and call `.parse()` on each candidate before returning.

**Pros:** Full structural validation; throws on malformed output with actionable error. Eliminates the unsafe cast.
**Cons:** Requires exporting/sharing the Zod schemas (which also resolves todo 081).
**Effort:** Small–Medium (depends on whether schemas are already shared)
**Risk:** Low

### Option B — Add explicit element guard in the `.map()`
Check `typeof lesson.sequencePosition === 'number'` and filter out invalid lessons before sorting.

```ts
.filter(l => typeof (l as CuratedLesson).sequencePosition === 'number')
.sort(...)
```

**Pros:** No additional dependencies. Matches the filtering style already used at line 256.
**Cons:** Does not validate other fields; still relies on runtime shape assumptions.
**Effort:** Small
**Risk:** Medium

## Recommended Action

Option A if schemas are being shared (pairs with todo 081). Option B as an immediate stopgap.

## Technical Details

**Affected files:**
- `src/lib/ai.ts:260–266`

## Acceptance Criteria

- [ ] Lesson elements from AI response are validated before the cast to `CuratedLesson[]`
- [ ] A Claude response with missing `sequencePosition` throws an error rather than silently sorting wrong
- [ ] No bare `as CuratedLesson[]` cast on unvalidated data

## Work Log

- 2026-04-04: Found by TypeScript reviewer code review
