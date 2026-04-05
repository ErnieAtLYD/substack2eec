---
status: pending
priority: p2
issue_id: "083"
tags: [code-review, typescript, bug, ui]
dependencies: []
---

# `lessonCount: 5` Hardcoded to Curate But `expectedLessonCount` Uses `candidate.lessons.length` — Progress Counter Mismatch

## Problem Statement

In `handleConfirmCandidate`, the progress counter is set from the candidate:
```ts
setExpectedLessonCount(candidate.lessons.length)  // ReviewForm.tsx:176
```

But the curate API call sends `lessonCount: 5` hardcoded:
```ts
body: JSON.stringify({ posts: fetchedPosts, lessonCount: 5, selectedCourse: candidate })
// ReviewForm.tsx:187
```

When `selectedCourse` is provided, the server ignores `lessonCount` entirely (the candidate's lessons array determines the plan). So if Claude returned a candidate with 3 lessons (which `CuratedLessonSchema.min(1).max(10)` allows), `expectedLessonCount` is correctly 3, but the UI shows a progress denominator based on `candidate.lessons.length` while the actual number of lessons generated may differ if the server re-interprets the request.

More importantly: the hardcoded `lessonCount: 5` is misleading noise in the request body. It implies the server uses it when `selectedCourse` is provided, but it doesn't.

## Findings

- `src/components/features/ReviewForm.tsx:176` — `setExpectedLessonCount(candidate.lessons.length)`
- `src/components/features/ReviewForm.tsx:187` — `lessonCount: 5` hardcoded
- `src/app/api/curate/route.ts:70` — `lessonCount` only used in the `else` branch (no `selectedCourse`)

**Source:** TypeScript reviewer

## Proposed Solutions

### Option A — Send `candidate.lessons.length` as `lessonCount` (Recommended)
```ts
body: JSON.stringify({
  posts: fetchedPosts,
  lessonCount: candidate.lessons.length,
  selectedCourse: candidate,
})
```
This makes the request honest (even if the server ignores it when `selectedCourse` is present) and avoids confusion when reading network requests.

**Effort:** Trivial | **Risk:** None

### Option B — Omit `lessonCount` when `selectedCourse` is provided
```ts
body: JSON.stringify({ posts: fetchedPosts, selectedCourse: candidate })
```
The route defaults `lessonCount` to 5 when omitted, which is irrelevant since `selectedCourse` path ignores it anyway.

**Effort:** Trivial | **Risk:** None

## Recommended Action

Option A — makes the intent explicit.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:187`

## Acceptance Criteria

- [ ] `lessonCount` sent in the curate request matches the candidate's actual lesson count, or is omitted
- [ ] Progress counter (`expectedLessonCount`) matches what will actually be generated

## Work Log

- 2026-04-04: Found by TypeScript reviewer
