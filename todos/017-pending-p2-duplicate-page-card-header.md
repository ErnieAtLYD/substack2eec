---
status: pending
priority: p2
issue_id: "017"
tags: [code-review, ui, duplication]
dependencies: []
---

# Duplicate Icon + Heading: Page Header and Input Card Both Render During `input` Step

## Problem Statement

During `step === 'input'`, the component renders two icon+heading blocks stacked on top of each other: the page-level hero header (visible on `input`, `fetching`, `generating`) and the input card's own centered icon+heading ("Transform Your Substack"). The card header duplicates the page header's purpose — both explain what the tool does.

**Why it matters:** Visual duplication confuses the layout intent. The user sees two icons and two headings for the same step.

## Findings

**Location:** `src/components/features/ReviewForm.tsx`

Page header (shown on `input|fetching|generating`):
```tsx
{(step === 'input' || step === 'fetching' || step === 'generating') && (
  <div className="text-center mb-10">
    <div>...</div>  {/* graduation cap icon */}
    <h1>Substack to Email Course</h1>
    <p>Transform your Substack newsletter...</p>
  </div>
)}
```

Input card header (shown inside the card only during `input`):
```tsx
{step === 'input' && (
  <div className="w-full max-w-2xl rounded-2xl ...">
    <div className="flex flex-col items-center text-center mb-8">
      <div>...</div>  {/* book icon */}
      <h2>Transform Your Substack</h2>
      <p>Enter your Substack URL...</p>
    </div>
    ...
  </div>
)}
```

During `input`, both render simultaneously.

## Proposed Solutions

### Option A — Remove the card-level icon+heading (Recommended)

Keep the page-level hero header (it also appears during `fetching`/`generating`). Remove the inner card's `<div className="flex flex-col items-center text-center mb-8">` block and promote the form directly.

- **Pros:** Clean hierarchy, no duplication, ~12 LOC removed
- **Cons:** Card becomes more utilitarian
- **Effort:** Small | **Risk:** Very Low

### Option B — Remove the page-level hero header

Show the hero content only inside the card. Update `fetching` and `generating` steps to include their own minimal headings.
- **Pros:** Card-centric layout feels more cohesive
- **Cons:** Each step needs its own heading
- **Effort:** Small-Medium | **Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [ ] During `step === 'input'`, only one icon and one heading are visible
- [ ] `fetching` and `generating` steps still have appropriate heading/context

## Work Log

- 2026-03-27: Surfaced by simplicity reviewer agent during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
