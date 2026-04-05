---
status: pending
priority: p2
issue_id: "052"
tags: [code-review, typescript, robustness]
dependencies: []
---

# `raw.lessons` Elements Cast to `CuratedLesson[]` Without Field Validation

## Problem Statement

In `curatePostSelection`, after confirming `raw.lessons` is an array, its elements are immediately cast to `CuratedLesson[]` and sorted by `sequencePosition`. If the model returns lesson objects without `sequencePosition`, the sort computes `undefined - undefined` (NaN), producing a non-deterministic order silently. No element-level validation is performed.

## Findings

**Location:** `src/lib/ai.ts:137-143`

```typescript
if (!Array.isArray(raw.lessons)) {
  // handles missing array...
}

const lessons = (raw.lessons as CuratedLesson[])  // unsafe cast
  .slice()
  .sort((a, b) => a.sequencePosition - b.sequencePosition)  // undefined - undefined = NaN
```

The `Array.isArray` guard only confirms the value is an array — it says nothing about element shapes. A model response with malformed lesson objects (missing `sequencePosition`, wrong type) silently produces undefined behavior in the sort comparator.

`sequencePosition` values also go directly into iteration logic downstream.

## Proposed Solutions

### Option A: Filter + guard before sorting (Recommended, minimal)
```typescript
const lessons = (raw.lessons as CuratedLesson[])
  .filter(l => typeof l?.sequencePosition === 'number' && typeof l?.slug === 'string')
  .slice()
  .sort((a, b) => a.sequencePosition - b.sequencePosition)
```

### Option B: Zod parse the tool response
```typescript
const LessonSchema = z.object({
  slug: z.string(),
  sequencePosition: z.number().int().positive(),
  lessonFocus: z.string(),
  selectionRationale: z.string(),
})
const lessons = z.array(LessonSchema).parse(raw.lessons)
  .sort(...)
```
- **Pros:** Full structural validation of LLM tool output
- **Cons:** More code; adds a Zod schema for the response shape

### Option C: Add error if sequencePosition is missing
```typescript
for (const lesson of raw.lessons as CuratedLesson[]) {
  if (typeof lesson.sequencePosition !== 'number') {
    throw new Error('Curation response was incomplete or invalid. Please try again.')
  }
}
```

## Recommended Action

Option A as a minimal guard. Prevents NaN sort behavior without restructuring the code.

## Technical Details

**Affected file:** `src/lib/ai.ts:137-143`

## Acceptance Criteria

- [ ] Sort comparator cannot produce NaN from undefined `sequencePosition`
- [ ] Malformed lesson elements do not silently corrupt lesson order

## Work Log

- 2026-03-29: Found during TypeScript review of batch fixes (round 2)
