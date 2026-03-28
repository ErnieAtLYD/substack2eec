---
status: pending
priority: p2
issue_id: "025"
tags: [code-review, quality, logic-error]
dependencies: ["015"]
---

# Review Step Warning Compares `lessons.length` Against Wrong Baseline

## Problem Statement

The review step shows a warning when the course generated fewer lessons than expected. However it compares `lessons.length` against `lessonCount` (the user-requested count, which is always `5` since the picker was removed) rather than `expectedLessonCount` (the actual count returned by the AI's selection event). This causes the warning to fire incorrectly for any course where the AI intentionally chose fewer than 5 lessons.

**Why it matters:** A user running a newsletter with only 3 suitable public posts should get a 3-lesson course with no warning — the AI made the right call. Instead, they'll always see "Only 3 suitable public posts found — course is shorter than 5 lessons" even though 3 was the correct output.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:440–444`

```tsx
{lessons.length < lessonCount && (
  <p className="text-sm text-amber-600">
    Only {lessons.length} suitable public post{lessons.length !== 1 ? 's' : ''} found — course is shorter than {lessonCount} lessons.
  </p>
)}
```

- `lessonCount` is always `5` since the picker was removed in PR #3
- `expectedLessonCount` is set from `event.data.lessons.length` in the SSE `selection` event — this is what the AI decided to generate
- If the AI selected 3 lessons because only 3 were suitable, `expectedLessonCount` will be `3` and `lessons.length` will be `3` → no warning should appear
- But with the current code: `3 < 5` → warning fires incorrectly

The correct comparison is `lessons.length < expectedLessonCount`.

**Related:** This issue is compounded by todo `015` (lessonCount dead state). Once `lessonCount` is cleaned up, this comparison becomes obviously wrong since `lessonCount` would be a literal `5`. Fixing `015` first will surface this bug more clearly.

## Proposed Solutions

### Option A: Change comparison to use `expectedLessonCount` (Recommended)
```tsx
{lessons.length < expectedLessonCount && (
  <p className="text-sm text-amber-600">
    Only {lessons.length} suitable public post{lessons.length !== 1 ? 's' : ''} found — course is shorter than expected.
  </p>
)}
```
- **Pros:** Compares actual vs expected, not user-requested vs actual
- **Effort:** Trivial
- **Risk:** None

### Option B: Remove the warning entirely
If the AI always produces the right number of lessons given available content, the warning is noise. The user can see how many lessons exist by counting the cards.
- **Pros:** Simpler, no incorrect warnings
- **Cons:** Loses informational value when partial generation is genuinely unexpected
- **Effort:** Trivial
- **Risk:** None

## Recommended Action

Option A. The warning is useful when the AI was asked for more lessons than it could produce. `expectedLessonCount` is the right baseline.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:440` — warning condition
- `src/components/features/ReviewForm.tsx:443` — warning message (update "than {lessonCount}" → "than expected" or "than {expectedLessonCount}")

## Acceptance Criteria

- [ ] No false warning when AI returns exactly the number of lessons it intended to generate
- [ ] Warning still appears when `event.done.lessons.length < event.selection.lessons.length` (i.e., generation completed with fewer lessons than the AI initially planned)
- [ ] Warning message accurately describes the shortfall

## Work Log

- 2026-03-28: Finding created from PR #3 code review (feat/ui-redesign-centered-layout)

## Resources

- PR #3: feat(ui): redesign homepage with centered card layout
- TypeScript reviewer finding: "P2 — lessonCount used as comparison baseline is semantically wrong"
- Related: todo 015 (lessonCount dead state)
