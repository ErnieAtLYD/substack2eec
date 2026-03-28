---
status: pending
priority: p2
issue_id: "015"
tags: [code-review, quality, dead-code]
dependencies: []
---

# `lessonCount` State Is Dead — Selector Was Removed, Leaving Misleading Code

## Problem Statement

The UI redesign removed the lesson count selector but left `lessonCount` state, the `ALLOWED_LESSON_COUNTS` import, the `LessonCount` type, and a feature badge ternary that is always the same branch. The feature badge always shows "3–5 emails per course" because `lessonCount` is hardcoded to `5` and never changed. This misleads future developers into thinking the selector exists or is planned.

**Why it matters:** Dead state and dead imports obscure what the component actually does. The `ALLOWED_LESSON_COUNTS` import implies multi-count support is active when it is not. The ternary `lessonCount === 5 ? '3–5' : lessonCount` will never take the false branch.

## Findings

**Location:** `src/components/features/ReviewForm.tsx`

- Line 4: `import { ..., ALLOWED_LESSON_COUNTS, ... }` — `ALLOWED_LESSON_COUNTS` never rendered
- Line 64: `const [lessonCount, setLessonCount] = useState<LessonCount>(5)` — `setLessonCount` never called
- Line 368: `{lessonCount === 5 ? '3–5' : lessonCount} emails per course` — always `'3–5'`

**Known Pattern:** Agent-native reviewer also flagged this: agents calling `/api/curate` with `lessonCount: 10` have more capability than UI users, which is an inconsistency.

## Proposed Solutions

### Option A — Remove dead code (Recommended if selector not planned)

Delete `lessonCount` state, `setLessonCount`, `ALLOWED_LESSON_COUNTS` import, `LessonCount` type import. Replace badge with hardcoded `"3–5 emails per course"`. Pass hardcoded `5` to the API call.

- **Pros:** Removes confusion, ~5 LOC reduction, honest code
- **Cons:** If selector is re-added later, imports must be re-added
- **Effort:** Small | **Risk:** Very Low

### Option B — Re-add the selector UI

Add back a `<select>` or pill-toggle for `ALLOWED_LESSON_COUNTS` in the input card, which was present before the redesign.

- **Pros:** Restores user-agent feature parity (users can choose lesson count)
- **Cons:** Adds UI complexity to the redesigned card
- **Effort:** Small-Medium | **Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [ ] No unused imports (`ALLOWED_LESSON_COUNTS`, `LessonCount`) if selector is removed
- [ ] Feature badge text is not a dead ternary
- [ ] `setLessonCount` is either called from UI or removed

## Work Log

- 2026-03-27: Surfaced by TypeScript reviewer, simplicity reviewer, and agent-native reviewer during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
