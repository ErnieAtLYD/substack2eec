---
status: done
priority: p3
issue_id: "031"
tags: [code-review, react, accessibility]
dependencies: []
---

# Stream Log List Items Use Array Index as React Key

## Problem Statement

The `streamLog` render uses `key={i}` (array index) on list items. While `streamLog` is currently append-only and index keys are stable in that scenario, using index keys is a fragile pattern that will produce incorrect React diffing if the list is ever reordered, filtered, or has items removed (e.g., on retry/start-over clearing the log).

## Findings

**Location:** `src/components/features/ReviewForm.tsx` — stream log render section

```tsx
{streamLog.map((line, i) => (
  <li key={i} className="...">
    {line}
  </li>
))}
```

The line content itself is unique and deterministic — each entry is formatted as `Course: "..."`, `Writing lesson N…`, or `✓ Lesson N: Title`. Using `key={line}` would be stable and semantically correct.

**Edge case:** If a publication has two lessons with identical titles, `key={line}` could collide. Using a composite key like `key={`${i}-${line}`}` is the safest option.

## Proposed Solutions

### Option A: Use composite key (Recommended)
```tsx
{streamLog.map((line, i) => (
  <li key={`${i}-${line}`} className="...">
```
- **Pros:** Stable identity tied to both position and content; survives reorder/filter
- **Effort:** Trivial

### Option B: Use content as key
```tsx
{streamLog.map((line) => (
  <li key={line} className="...">
```
- **Pros:** Semantically clear
- **Cons:** Breaks if duplicate lines exist (though unlikely)
- **Effort:** Trivial

## Recommended Action

Option A — composite key.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx` — stream log list render

## Acceptance Criteria

- [ ] Stream log list items do not use bare array index as `key`
- [ ] No React key warning in console during generation

## Work Log

- 2026-03-28: Finding from PR #3 TypeScript review

## Resources

- PR #3: `feat/ui-redesign-centered-layout`
- React docs: "Why not use indexes as keys" — https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
