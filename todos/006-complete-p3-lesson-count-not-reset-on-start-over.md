---
status: pending
priority: p3
issue_id: "006"
tags: [code-review, frontend, ux]
dependencies: []
---

# `lessonCount` Not Reset on "Start Over"

## Problem Statement

The `handleStartOver` function resets all other form state (`url`, `lessons`, `courseMeta`, `streamLog`, `error`, `skippedCount`) but does not reset `lessonCount` back to 5. Whether this is intentional (preserve the user's picker choice) or an oversight is ambiguous — but it should be made explicit.

**Why it matters:** UX inconsistency — all other state clears on "Start Over" but the picker silently retains its value. If it's intentional, a comment should document the decision.

## Findings

**Location:** `src/components/features/ReviewForm.tsx` — `handleStartOver` function

```typescript
function handleStartOver() {
  setStep('input')
  setUrl('')
  setLessons([])
  setCourseMeta({ courseTitle: '', courseDescription: '' })
  setStreamLog([])
  setError(null)
  setSkippedCount(0)
  clearSessionLessons()
  // lessonCount is NOT reset — intentional?
}
```

**Pre-existing or new?** Introduced by this PR — `lessonCount` is a new state variable.

## Proposed Solutions

### Option A: Reset `lessonCount` to 5 on start-over
```typescript
setLessonCount(5)
```
Add this line to `handleStartOver`. Consistent with "clean slate" UX.
- **Pros:** All state resets together; no surprises
- **Effort:** Tiny (1 line)
- **Risk:** None

### Option B: Preserve `lessonCount` intentionally (add comment)
```typescript
// Intentionally preserve lessonCount — user may want to generate another course
// at the same length without re-selecting the picker.
```
- **Pros:** No behavior change; preserves user's intent across sessions
- **Effort:** Tiny (1 line comment)
- **Risk:** None

## Recommended Action

Option A — reset for consistency. The "Start Over" intent is to return to a blank slate. If the user wants the same count again, one radio click is trivial. Option B is acceptable if the team prefers it, but the comment is required.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx` — `handleStartOver`

## Acceptance Criteria

- [ ] `handleStartOver` either explicitly resets `lessonCount` to 5 OR includes a comment documenting the intentional non-reset

## Work Log

- 2026-03-18: Finding created from code review of PR #1 (feat/custom-course-length)

## Resources

- PR #1: feat: custom course length picker
- TypeScript reviewer finding: "P3-1 lessonCount not reset on start-over"
