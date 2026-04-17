---
status: pending
priority: p2
issue_id: "128"
tags: [code-review, zod, validation, correctness]
dependencies: []
---

# `GeneratedLessonSchema.lessonNumber` Accepts Floats, Negatives, and Values >50

## Problem Statement

`GeneratedLessonSchema.lessonNumber` is declared as `z.number()` with no integer, min, or max constraint. This accepts `0`, `-1`, `3.14`, and `1e308` as valid lesson numbers. The field is embedded in the README table of contents (`${l.lessonNumber}.`) and used structurally throughout the pipeline. Non-integer or out-of-range values produce malformed output.

## Findings

**Location:** `src/types/index.ts:46`

```ts
lessonNumber: z.number(),
```

Compare to `CuratedLessonSchema.sequencePosition` at line 17:
```ts
sequencePosition: z.number().int().min(1).max(10),
```

The export route already caps lessons at 50 (`z.array(GeneratedLessonSchema).min(1).max(50)`), making `lessonNumber > 50` contradictory by construction but not schema-enforced on the field itself.

Values that should be rejected but currently pass:
- `0` — lesson number "0" produces nonsense TOC entry
- `-1` — negative lesson number
- `3.14` — README TOC: `3.14. **Title**`
- `Infinity`, `NaN` — JSON-serializable pathological values

## Proposed Solutions

### Option A: Add `.int().min(1).max(50)` (Recommended)
```ts
lessonNumber: z.number().int().min(1).max(50),
```
- `.int()` — must be a whole number
- `.min(1)` — lesson numbers start at 1
- `.max(50)` — matches the `lessons` array `.max(50)` constraint
- Pros: Consistent with `CuratedLessonSchema.sequencePosition` pattern; self-documenting bounds
- Cons: None

### Option B: `.int().min(1)` without max
```ts
lessonNumber: z.number().int().min(1),
```
- Leaves upper bound open in case lesson counts expand beyond 50 in future
- Pros: More flexible
- Cons: Inconsistent with the array `.max(50)` guard; YAGNI

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/types/index.ts:46`
- **Effort:** Small (one line)

## Acceptance Criteria

- [ ] `lessonNumber: 0` is rejected by `GeneratedLessonSchema`
- [ ] `lessonNumber: -1` is rejected by `GeneratedLessonSchema`
- [ ] `lessonNumber: 3.14` is rejected by `GeneratedLessonSchema`
- [ ] `lessonNumber: 1` and `lessonNumber: 50` are accepted

## Work Log

- 2026-04-16: Identified by TypeScript reviewer and security sentinel during code review of `fix/export-todos-117-125`
