---
status: complete
priority: p2
issue_id: "035"
tags: [code-review, logic-error, session-restore]
dependencies: ["025"]
---

# Session Restore Leaves `expectedLessonCount` at Default — False Warning on Restored Courses

## Problem Statement

The mount `useEffect` restores `lessons` and `courseMeta` from `sessionStorage` but does not restore `expectedLessonCount`. It stays at its initial value of `5`. Any restored course with fewer than 5 lessons (e.g., a valid 3-lesson course) immediately shows a false-positive warning: "Only 3 suitable public posts found — course is shorter than expected."

**Why it matters:** Every user who refreshes the page after a 3-lesson generation sees an alarming amber warning implying something went wrong — but the course is complete and correct.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:88–96`

```typescript
// Before fix
useEffect(() => {
  const saved = readSessionLessons()
  const meta = readSessionMeta()
  if (saved && saved.length > 0) {
    setLessons(saved)
    if (meta) setCourseMeta(meta)
    // ← no setExpectedLessonCount — stays at 5
    setStep('review')
  }
}, [])
```

The warning at line 451:
```tsx
{lessons.length < expectedLessonCount && (  // 3 < 5 → always true after restore
```

`CourseMeta` only stores `courseTitle` and `courseDescription` — `expectedLessonCount` is not persisted anywhere in `sessionStorage`.

## Fix Applied

Add `setExpectedLessonCount(saved.length)` inside the restore block:

```typescript
if (saved && saved.length > 0) {
  setLessons(saved)
  setExpectedLessonCount(saved.length)  // ← derive from restored lessons
  if (meta) setCourseMeta(meta)
  setStep('review')
}
```

Since a completed session always has exactly the number of lessons that were generated, `saved.length` is the correct baseline. If generation was interrupted (partial restore), the warning fires correctly because fewer lessons were saved than were expected.

## Acceptance Criteria

- [x] Restored 3-lesson course shows no warning
- [x] Restored 5-lesson course shows no warning
- [x] Interrupted generation (e.g., 2 of 5 lessons saved) still shows warning

## Work Log

- 2026-03-28: Found during final review of PR #3 (TypeScript reviewer + session restore specialist agent)
- 2026-03-28: Fixed in commit — `setExpectedLessonCount(saved.length)` added to mount useEffect

## Resources

- PR #3: `feat/ui-redesign-centered-layout`
- Related: todo 025 (wrong comparison baseline — fixed earlier)
