---
title: "fix: Revert SparkIcon to narrow { className?: string } type"
type: fix
status: completed
date: 2026-04-13
---

# fix: Revert SparkIcon to Narrow `{ className?: string }` Type

PR #9 widened `SparkIcon`'s prop type to `SVGProps<SVGSVGElement>` to allow future callers to pass arbitrary SVG attributes. Two reviewers independently flagged this as problematic: the spread ordering is wrong (structural attrs before `{...props}` means callers can override `aria-hidden`, `fill`, `viewBox`), and the widening is YAGNI for a private single-use component with one call site that only ever passes `className`. The recommended fix is to revert the narrow type — no flexibility is needed today, and adding it when a real caller needs it is the right time.

## Acceptance Criteria

- [x] `SparkIcon` signature reverted to `{ className }: { className?: string }`
- [x] `type SVGProps` removed from the React import on line 1
- [x] `{...props}` spread removed from the `<svg>` element
- [x] Existing call site `<SparkIcon className="w-4 h-4" />` (line 397) compiles and renders unchanged
- [x] `npx tsc --noEmit` passes with no errors
- [x] Todo #115 marked complete

## Context

**Affected file:** `src/components/features/ReviewForm.tsx:76–82`

**Current (post-PR #9):**
```tsx
import { useState, useEffect, useRef, type SVGProps } from 'react'
...
function SparkIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props} className={className}>
```

**Target (reverted):**
```tsx
import { useState, useEffect, useRef } from 'react'
...
function SparkIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
```

Three lines change: import line, function signature, svg element. The two orientation comments added by PR #9 (`// On mount: restore from sessionStorage if available` and `// stable enough — entries are append-only`) are **not** reverted — they are correct and should remain.

## Implementation

### `src/components/features/ReviewForm.tsx`

1. Line 1: Remove `type SVGProps` from the React import
2. Line 76: Change `{ className, ...props }: SVGProps<SVGSVGElement>` → `{ className }: { className?: string }`
3. Line 78: Remove `{...props}` from `<svg>` attributes

## Sources

- Todo: `todos/115-pending-p2-sparkicon-svgprops-spread-order-or-revert.md`
- PR: ErnieAtLYD/substack2eec#9
- Reviewers: kieran-typescript-reviewer (spread ordering), code-simplicity-reviewer (YAGNI)
