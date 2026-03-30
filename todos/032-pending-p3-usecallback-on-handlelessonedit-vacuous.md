---
status: done
priority: p3
issue_id: "032"
tags: [code-review, react, simplicity]
dependencies: []
---

# `useCallback` on `handleLessonEdit` Is Vacuous — No Memoized Consumer

## Problem Statement

PR #3 wrapped `handleLessonEdit` in `useCallback([], [])` as part of the stale-closure fix. The stale closure fix itself is correct (functional `setLessons(prev => ...)` updater), but the `useCallback` wrapper provides no performance benefit because the function is only referenced inside an inline `.map()` arrow function — which creates a new reference on every render regardless.

**Why it matters:** The `useCallback` import was added specifically for this wrapper. Removing it reduces unnecessary imports and removes a pattern that could mislead future developers into thinking there is a memoized child component consuming `handleLessonEdit` directly.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:271–279`

```typescript
// The useCallback wrapper:
const handleLessonEdit = useCallback((index: number, value: string) => {
  setLessons(prev => { ... })
}, [])

// How it's consumed in JSX:
onChange={e => handleLessonEdit(i, e.target.value)}
//       ↑ new arrow function on every render — useCallback on the outer fn is a no-op
```

`useCallback` is beneficial when the memoized function is passed directly to a `React.memo`-wrapped child or used in a `useEffect` dependency array. Neither applies here.

**Import line:** `src/components/features/ReviewForm.tsx:3`
```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
//                                         ↑ only used by this one wrapper
```

## Proposed Solutions

### Option A: Remove `useCallback`, make it a plain function (Recommended)
```typescript
function handleLessonEdit(index: number, value: string) {
  setLessons(prev => {
    const updated = prev.map((l, i) =>
      i === index ? { ...l, markdownBody: value } : l
    )
    writeSessionLessons(updated)
    return updated
  })
}
```
- Remove `useCallback` from the import list
- **Pros:** Simpler; consistent with `handleGenerate`, `handleDownload`, `handleStartOver`
- **Cons:** None
- **Effort:** Trivial

## Recommended Action

Option A. The functional-updater stale-closure fix is correct and does not need `useCallback` to work.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:3` (import), `271–279` (function)

## Acceptance Criteria

- [ ] `handleLessonEdit` is a plain `function` declaration (not `useCallback`)
- [ ] `useCallback` is removed from the React import
- [ ] Rapid edits to multiple textareas still work correctly (functional updater preserved)
- [ ] No `useCallback` or `useCallback`-related lint warnings

## Work Log

- 2026-03-28: Finding from PR #3 code simplicity review

## Resources

- PR #3: `feat/ui-redesign-centered-layout`
- React docs: useCallback — "Only call `useCallback` at the top level... It does not prevent creating the function — you're always creating a function, but React ignores it"
