---
status: done
priority: p3
issue_id: "033"
tags: [code-review, css, simplicity]
dependencies: []
---

# Redundant `min-h-screen` on `page.tsx` `<main>` Element

## Problem Statement

`page.tsx` wraps `ReviewForm` in a `<main className="min-h-screen bg-white">`. `ReviewForm` itself renders a root `<div className="flex flex-col min-h-screen">`. Both elements assert `min-h-screen`. The outer `<main>` assertion is redundant — `ReviewForm` fully controls the height and is the only child.

## Findings

**Location 1:** `src/app/page.tsx:5`
```tsx
<main className="min-h-screen bg-white">
  <ReviewForm />
</main>
```

**Location 2:** `src/components/features/ReviewForm.tsx:286`
```tsx
<div className="flex flex-col min-h-screen">
```

The `flex flex-col min-h-screen` on `ReviewForm`'s root div establishes the full-screen flex column that enables the footer to stick to the bottom via `flex-1` on the content area. The `<main>`'s `min-h-screen` adds no visual or layout effect since `ReviewForm` already covers the full viewport height.

## Proposed Solutions

### Option A: Remove `min-h-screen` from `page.tsx` (Recommended)
```tsx
<main className="bg-white">
  <ReviewForm />
</main>
```
- **Pros:** Eliminates redundancy; single source of truth for height control
- **Effort:** Trivial
- **Risk:** None — visual output is identical

## Recommended Action

Option A.

## Technical Details

**Affected files:**
- `src/app/page.tsx:5`

## Acceptance Criteria

- [ ] `page.tsx` `<main>` does not have `min-h-screen`
- [ ] Page still renders full-screen (controlled by `ReviewForm`'s own `min-h-screen`)
- [ ] Footer still sticks to bottom of viewport

## Work Log

- 2026-03-28: Finding from PR #3 code simplicity review

## Resources

- PR #3: `feat/ui-redesign-centered-layout`
