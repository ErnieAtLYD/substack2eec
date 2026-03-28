---
status: complete
priority: p1
issue_id: "012"
tags: [code-review, correctness, react, data-loss]
dependencies: []
---

# Stale Closure in `handleLessonEdit` Can Silently Drop Edits

## Problem Statement

`handleLessonEdit` closes over the `lessons` state value at render time. If two edits arrive before a re-render (e.g., rapid typing or paste), the second edit replaces the first because it writes from the stale snapshot. This causes silent data loss — the user's content disappears with no error shown.

**Why it matters:** The entire UX value of the review step is letting users edit lesson content. A bug that silently drops edits directly undermines the core user workflow.

## Findings

**Location:** `src/components/features/ReviewForm.tsx`, lines 263–269

```typescript
function handleLessonEdit(index: number, value: string) {
  const updated = lessons.map((l, i) =>   // ❌ closes over stale `lessons`
    i === index ? { ...l, markdownBody: value } : l
  )
  updateLessons(updated)
}
```

`updateLessons` is defined as:
```typescript
function updateLessons(updated: GeneratedLesson[]) {
  setLessons(updated)
  writeSessionLessons(updated)
}
```

Both `setLessons` and `writeSessionLessons` receive the stale-based result. If a second `onChange` fires before React flushes, `lessons` in the closure is the pre-first-edit snapshot.

## Proposed Solutions

### Option A — Functional setState form (Recommended)
Use functional `setLessons(prev => ...)` to avoid closing over stale state. Also wrap in `useCallback` for reference stability.

```typescript
const handleLessonEdit = useCallback((index: number, value: string) => {
  setLessons(prev => {
    const updated = prev.map((l, i) =>
      i === index ? { ...l, markdownBody: value } : l
    )
    writeSessionLessons(updated)
    return updated
  })
}, [])
```

- **Pros:** Fixes data loss, stable reference, no stale closure
- **Cons:** `writeSessionLessons` is now inside setState callback (acceptable — it's a side effect)
- **Effort:** Small | **Risk:** Low

### Option B — Debounce edits
Debounce `handleLessonEdit` at 150ms to prevent rapid concurrent calls.
- **Pros:** Also reduces sessionStorage write frequency
- **Cons:** Does not fix the root cause; delayed writes feel laggy
- **Effort:** Small | **Risk:** Low (but incomplete fix)

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `src/components/features/ReviewForm.tsx`
- **Components:** `handleLessonEdit`, `updateLessons`, lesson textarea `onChange`

## Acceptance Criteria

- [ ] Rapidly editing the same textarea twice before a re-render preserves both edits
- [ ] `handleLessonEdit` uses functional `setLessons` form
- [ ] `sessionStorage` is updated with the correct final value

## Work Log

- 2026-03-27: Surfaced by performance-oracle and TypeScript reviewer agents during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
