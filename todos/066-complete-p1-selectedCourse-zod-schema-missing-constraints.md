---
status: pending
priority: p1
issue_id: "066"
tags: [code-review, security, zod, multi-candidate]
dependencies: []
---

# `selectedCourse` Zod Schema Missing Length Constraints and Slug Cross-Reference

## Problem Statement

The plan says "Add `selectedCourse?: CuratedSelection` to the Zod schema" but does not specify the schema. Two concrete bugs result from a permissive schema:

1. **Prompt bloat / DoS**: A `courseTitle` of 10,000 characters passes an unconstrained schema and flows into the AI prompt, burning token budget.
2. **Silent empty course**: If `selectedCourse.lessons` contains slugs not present in the submitted `posts` array, the route's `postsBySlug.get(curatedLesson.slug)` check (`src/app/api/curate/route.ts:65`) silently continues (`if (!post) continue`), producing a zero-lesson course with an HTTP 200 and a `done` SSE event containing an empty array. The client stores an empty course in sessionStorage with no error.

The existing `buildCurationTool` JSON Schema in `src/lib/ai.ts:31-61` defines the correct constraints. The Zod schema must mirror them.

## Findings

**Source:** TypeScript reviewer (finding 1), security sentinel (finding 3)

**Affected plan section:** "Modified route — POST /api/curate"

**Existing `buildCurationTool` constraints to mirror:**
- `courseTitle`: ≤60 chars
- `courseDescription`: 2–3 sentences (bound to ~500 chars)
- `targetAudience`: 1 sentence (~200 chars)
- `overallRationale`: ~500 chars
- Lessons: `slug` ≤500, `sequencePosition`: integer 1–lessonCount, `lessonFocus` and `selectionRationale` ~300 chars

## Proposed Solutions

### Option A — Inline Zod schema in the curate route (Recommended)

Add a `CuratedSelectionSchema` Zod object in `src/app/api/curate/route.ts` and reference it from the main request schema:

```typescript
const CuratedLessonSchema = z.object({
  slug: z.string().max(500),
  sequencePosition: z.number().int().min(1).max(10),
  lessonFocus: z.string().max(300),
  selectionRationale: z.string().max(300),
})

const CuratedSelectionSchema = z.object({
  courseTitle: z.string().max(60),
  courseDescription: z.string().max(500),
  targetAudience: z.string().max(200),
  overallRationale: z.string().max(500),
  lessons: z.array(CuratedLessonSchema).min(1).max(10),
})

// In CurateRequestSchema:
selectedCourse: CuratedSelectionSchema.optional(),
```

After successful Zod parse, validate slug cross-reference:
```typescript
if (body.selectedCourse) {
  const unknownSlugs = body.selectedCourse.lessons
    .map(l => l.slug)
    .filter(s => !postsBySlug.has(s))
  if (unknownSlugs.length > 0) {
    return NextResponse.json({ error: 'Selected course references posts not in the submitted list' }, { status: 400 })
  }
}
```

**Pros:** Co-located with the route that uses it; explicit constraints; catches fabricated slugs
**Cons:** Schema is only in the curate route; not shared with `propose-courses` route (though they serve different purposes)
**Effort:** Small
**Risk:** Low

### Option B — Export Zod schemas from `src/types/index.ts`

Move both `CuratedSelectionSchema` and `CuratedLessonSchema` into `src/types/index.ts` so both the curate and propose-courses routes import from the same definition.

**Pros:** Single source of truth
**Cons:** Mixes Zod schemas with TypeScript interfaces in the types file; creates a Zod dependency in the types module
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A. Keep the Zod schema co-located with the route. The `propose-courses` route has its own input schema (just `posts` and `lessonCount`) and doesn't need to validate a `CuratedSelection`. Add the slug cross-reference check after parsing.

## Technical Details

- **File:** `src/app/api/curate/route.ts`
- **Reference:** `src/lib/ai.ts:31-61` (buildCurationTool JSON Schema — use as the source of truth for constraints)

## Acceptance Criteria

- [ ] `CuratedSelectionSchema` defined with `.max()` on all string fields
- [ ] Slug cross-reference check added: 400 if any lesson slug not in submitted posts
- [ ] `selectedCourse` passes full Zod validation before any AI or SSE logic runs
- [ ] Plan document updated to include the Zod schema definition

## Work Log

- 2026-04-04: Created during plan review. TypeScript reviewer + security sentinel both flagged independently.
