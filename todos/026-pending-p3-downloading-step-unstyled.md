---
status: done
priority: p3
issue_id: "026"
tags: [code-review, ux, consistency]
dependencies: []
---

# `downloading` Step Not Wrapped in Card — Inconsistent with Other Loading States

## Problem Statement

PR #3 wrapped the `fetching` and `generating` steps in a styled card (`rounded-2xl border border-gray-200 bg-white shadow-lg`). The `downloading` step was left as a bare unstyled `<div>`. When the user clicks "Download ZIP", the review card disappears and the screen briefly shows a plain text pulse message floating in the center of the page without a card wrapper.

**Why it matters:** Visual consistency is broken. Every other in-progress state now uses the card shell, but `downloading` reverts to the pre-PR bare div style.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:485–487`

```tsx
{/* DOWNLOADING */}
{step === 'downloading' && (
  <div className="text-sm text-gray-500 animate-pulse">Preparing your ZIP…</div>
)}
```

Compare with `fetching` (lines 379–383):
```tsx
{step === 'fetching' && (
  <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-lg px-8 py-12 text-center">
    <p className="text-sm text-gray-500 animate-pulse">Fetching posts from Substack…</p>
  </div>
)}
```

The `downloading` step is brief (typically < 2 seconds) but the flash of unstyled content is jarring.

## Proposed Solutions

### Option A: Wrap in the same card shell as `fetching` (Recommended)
```tsx
{step === 'downloading' && (
  <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-lg px-8 py-12 text-center">
    <p className="text-sm text-gray-500 animate-pulse">Preparing your ZIP…</p>
  </div>
)}
```
- **Pros:** Consistent with all other steps; zero logic change
- **Effort:** Trivial
- **Risk:** None

### Option B: Extract a shared `<LoadingCard>` component
Create a reusable loading card and use it for `fetching` and `downloading`:
```tsx
function LoadingCard({ message }: { message: string }) {
  return (
    <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-lg px-8 py-12 text-center">
      <p className="text-sm text-gray-500 animate-pulse">{message}</p>
    </div>
  )
}
```
- **Pros:** DRY, easier to update all loading states at once
- **Cons:** More code than needed for 2 use cases
- **Effort:** Small
- **Risk:** None

## Recommended Action

Option A for now. Option B only if a third loading state is added.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:485–487` — downloading step

## Acceptance Criteria

- [ ] The `downloading` state renders inside a card with the same visual treatment as `fetching`
- [ ] No visual difference between entering and leaving loading states (consistent card wrapper)

## Work Log

- 2026-03-28: Finding created from PR #3 code review (feat/ui-redesign-centered-layout)

## Resources

- PR #3: feat(ui): redesign homepage with centered card layout
- Code simplicity reviewer finding: "downloading step is an orphaned bare div"
