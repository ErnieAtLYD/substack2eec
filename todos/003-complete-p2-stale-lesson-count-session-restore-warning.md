---
status: pending
priority: p2
issue_id: "003"
tags: [code-review, frontend, ux, session-restore]
dependencies: []
---

# Stale `lessonCount` State After Session Restore Causes Misleading Warning

## Problem Statement

`lessonCount` React state is not persisted to `sessionStorage`. When a user returns to the page and session restore fires (mount `useEffect`), `lessonCount` resets to the default `5` even if the restored course was generated with a different count. The warning "course is shorter than N lessons" then fires incorrectly — a valid 3-lesson course triggers "Only 3 posts found — course is shorter than 5 lessons."

**Why it matters:** The warning misleads returning users into thinking something went wrong with a generation that was intentionally short. Multiple agents flagged this (TypeScript reviewer, architecture strategist, simplicity reviewer).

## Findings

**Location:** `src/components/features/ReviewForm.tsx:344`

```tsx
{lessons.length < lessonCount && (
  <p className="text-sm text-amber-600">
    Only {lessons.length} suitable public post{lessons.length !== 1 ? 's' : ''} found — course is shorter than {lessonCount} lessons.
  </p>
)}
```

After session restore: `lessons` = 3 items (from `sessionStorage`), `lessonCount` = 5 (default).
Result: warning shows "shorter than 5 lessons" for a valid 3-lesson course.

**Pre-existing or new?** Introduced by this PR — the previous hardcoded `5` made the condition semantically correct in all cases; now it's user-supplied and not restored.

## Proposed Solutions

### Option A: Persist `lessonCount` to `sessionStorage` alongside course meta (Recommended)
Add `lessonCount` to the session save/restore logic:
```typescript
// In session save (after generation):
sessionStorage.setItem('eec_lesson_count', String(lessonCount))

// In session restore (mount effect):
const storedCount = sessionStorage.getItem('eec_lesson_count')
if (storedCount) setLessonCount(Number(storedCount))

// In clearSessionLessons:
sessionStorage.removeItem('eec_lesson_count')
```
- **Pros:** Warning remains accurate after restore; state is fully consistent
- **Cons:** Slightly more session management code
- **Effort:** Small
- **Risk:** None

### Option B: Suppress warning when in restored state
Track whether lessons came from session restore vs. fresh generation:
```typescript
const [isRestored, setIsRestored] = useState(false)
// In mount effect: setIsRestored(true) when restoring
// In handleGenerate: setIsRestored(false)
```
Then: `{!isRestored && lessons.length < lessonCount && ...}`
- **Pros:** Minimal change; sidesteps the stale state problem
- **Cons:** Adds another boolean flag; warning disappears on restore even if it would have been valid
- **Effort:** Small
- **Risk:** None

### Option C: Remove the warning (Simplest)
The user can count the lessons themselves. The warning adds marginal value and introduces this stale-state bug.
- **Pros:** Eliminates the issue entirely; -3 lines
- **Cons:** Removes potentially useful feedback for legitimate "too few posts" cases
- **Effort:** Tiny
- **Risk:** None

## Recommended Action

Option A — persist `lessonCount` to sessionStorage. It's the correct fix that keeps the warning accurate. Option C is acceptable if the team prefers fewer UI messages.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx` — session save/restore logic, warning condition

**Session storage key pattern:** Current keys are `eec_lessons`, `eec_meta`, `eec_skipped` — add `eec_lesson_count`.

## Acceptance Criteria

- [ ] After session restore with a 3-lesson course, warning does NOT fire
- [ ] After a fresh 3-lesson generation that returns 3 lessons, warning does NOT fire
- [ ] After a fresh 5-lesson generation that returns only 3 (post shortage), warning DOES fire

## Work Log

- 2026-03-18: Finding created from code review of PR #1 (feat/custom-course-length)

## Resources

- PR #1: feat: custom course length picker
- TypeScript reviewer finding: "P3-2 warning fires incorrectly after session restore"
- Architecture strategist finding: "P2-B stale lessonCount in review step"
- Simplicity reviewer finding: "P3 lessonCount comparison in review step uses stale state"
