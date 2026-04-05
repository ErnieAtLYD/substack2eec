---
status: pending
priority: p2
issue_id: "081"
tags: [code-review, simplicity, duplication, typescript, zod]
dependencies: [080]
---

# `CuratedLessonSchema` / `CuratedSelectionSchema` Duplicate TS Interfaces — Drift Risk

## Problem Statement

`CuratedLessonSchema` and `CuratedSelectionSchema` are defined in `src/app/api/curate/route.ts:11–24` to validate the incoming `selectedCourse` field. The same shapes already exist as TypeScript interfaces in `src/types/index.ts` (`CuratedLesson`, `CuratedSelection`). These two representations are now maintained independently, with no automated link between them.

If `CuratedSelection` gains a field (e.g., `difficultyLevel`), a developer will update the interface but may forget to update the Zod schema. The schema will silently accept objects missing the new field (it strips unknown keys), and the type system won't catch the mismatch.

Additionally, the propose-courses route returns `CuratedSelection[]` without validating against this schema — trusting raw AI output shape as-is.

## Findings

- `src/app/api/curate/route.ts:11–24` — Zod schemas for lesson/selection
- `src/types/index.ts` — `CuratedLesson`, `CuratedSelection` interfaces
- `src/app/api/propose-courses/route.ts` — no response-side validation of candidates
- `src/lib/ai.ts:256–266` — weak manual type narrowing instead of Zod parse

**Source:** TypeScript reviewer, simplicity reviewer

## Proposed Solutions

### Option A — Move Zod schemas to `src/types/index.ts`, derive interfaces with `z.infer<>` (Recommended)
Replace the `interface CuratedLesson` and `interface CuratedSelection` with:

```ts
export const CuratedLessonSchema = z.object({ ... })
export type CuratedLesson = z.infer<typeof CuratedLessonSchema>

export const CuratedSelectionSchema = z.object({ ... })
export type CuratedSelection = z.infer<typeof CuratedSelectionSchema>
```

Then import and use `CuratedSelectionSchema.parse()` in both routes and in `proposeCourseCandidates`.

**Pros:** Single source of truth. Eliminates drift forever. Fixes todo 077 (unsafe cast) as a side effect.
**Cons:** Changes how types are authored; requires Zod import in types file.
**Effort:** Medium
**Risk:** Low

### Option B — Keep schemas in curate route, add a comment linking to the interfaces
Document the relationship explicitly to alert future developers.

**Pros:** Zero structural change.
**Cons:** Comment rot; doesn't prevent drift.
**Effort:** Minimal
**Risk:** Medium

## Recommended Action

Option A — migrate to Zod-first types in `src/types/index.ts`. Also apply `CuratedSelectionSchema.parse()` in `proposeCourseCandidates` to fix todo 077.

## Technical Details

**Affected files:**
- `src/types/index.ts` — replace interfaces with Zod-derived types
- `src/app/api/curate/route.ts` — remove local schema definitions, import shared
- `src/app/api/propose-courses/route.ts` — add response validation
- `src/lib/ai.ts` — use schema parse instead of manual narrowing

## Acceptance Criteria

- [ ] `CuratedLesson` and `CuratedSelection` types have a single source of truth (Zod or interface, not both)
- [ ] Route validation and type definition are guaranteed in sync
- [ ] `proposeCourseCandidates` validates AI output against the schema before returning

## Work Log

- 2026-04-04: Found by TypeScript and simplicity reviewers
