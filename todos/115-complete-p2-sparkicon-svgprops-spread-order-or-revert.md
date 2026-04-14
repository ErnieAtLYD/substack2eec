---
status: complete
priority: p2
issue_id: "115"
tags: [code-review, typescript, ui, components, simplicity]
dependencies: []
---

# SparkIcon SVGProps: Fix Spread Order or Revert to Narrow Type

## Problem Statement

PR #9 widened `SparkIcon`'s prop type from `{ className?: string }` to `SVGProps<SVGSVGElement>`. Two reviewers flagged the result as problematic in different directions — and their findings are mutually exclusive. A decision is needed before merge.

## Findings

**TypeScript reviewer (P2):** The spread ordering on the `<svg>` element is wrong. `aria-hidden="true"`, `fill="currentColor"`, `viewBox="0 0 20 20"`, and `xmlns` all appear *before* `{...props}` on line 78:

```tsx
<svg aria-hidden="true" xmlns="..." viewBox="0 0 20 20" fill="currentColor" {...props} className={className}>
```

This means a caller can silently pass `aria-hidden={false}`, `fill="red"`, or `viewBox="0 0 24 24"` and override structural/accessibility attributes. Only `className` is protected (it comes after the spread). The type signature advertises full SVG prop support but the implementation does not guard the load-bearing attributes.

**Simplicity reviewer (P2):** `SparkIcon` is a private function — not exported, not reused — with exactly one call site that passes only `className="w-4 h-4"`. The entire `SVGProps` widening is YAGNI. The original `{ className?: string }` type was exactly correct for this usage. The widening adds an import (`type SVGProps`), a rest-destructure (`...props`), and a spread (`{...props}`) to serve zero actual consumers.

**Security reviewer (P3):** `SVGProps<SVGSVGElement>` extends `DOMAttributes<T>` which includes `dangerouslySetInnerHTML`. A future caller could pass raw HTML into the SVG element. No active exploit path today (one call site, only `className` passed), but it is a footgun.

## Proposed Solutions

### Option A — Revert to `{ className?: string }` (Recommended by Simplicity reviewer)

Remove the SVGProps widening entirely. Restore the original narrow type.

```tsx
import { useState, useEffect, useRef } from 'react'  // remove type SVGProps
...
function SparkIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="..." viewBox="0 0 20 20" fill="currentColor" className={className}>
```

- **Pros:** Eliminates all three issues (spread order, dangerouslySetInnerHTML, YAGNI) in one move; simplest possible fix; zero complexity added
- **Cons:** If a second call site ever needs more SVG props, widening must happen then
- **Effort:** Tiny | **Risk:** None

### Option B — Keep SVGProps, fix spread ordering (Recommended by TypeScript reviewer)

Move the spread first, then pin structural attributes:

```tsx
<svg {...props} aria-hidden="true" xmlns="..." viewBox="0 0 20 20" fill="currentColor" className={className}>
```

This makes `aria-hidden`, `fill`, `viewBox`, and `xmlns` non-overridable. Add `dangerouslySetInnerHTML` exclusion for safety:

```tsx
function SparkIcon({ className, dangerouslySetInnerHTML: _ignored, ...props }: SVGProps<SVGSVGElement>) {
```

- **Pros:** Preserves the type flexibility for future callers; correct defensive implementation
- **Cons:** More complex than Option A; flexibility not currently needed
- **Effort:** Small | **Risk:** Low

### Option C — Keep SVGProps with Omit, fix spread ordering

```tsx
function SparkIcon({ className, ...props }: Omit<SVGProps<SVGSVGElement>, 'dangerouslySetInnerHTML'>) {
  return (
    <svg {...props} aria-hidden="true" xmlns="..." viewBox="0 0 20 20" fill="currentColor" className={className}>
```

- **Pros:** Clean type signature; blocks the dangerouslySetInnerHTML footgun; structural attrs defended
- **Cons:** Still YAGNI for a single-use private component
- **Effort:** Tiny | **Risk:** None

## Recommended Action

Option A. The component has one call site, is not exported, and all reviewers agree on the YAGNI principle here. If a future call site needs more SVG props, Option B or C should be applied at that time.

## Technical Details

**Affected file:** `src/components/features/ReviewForm.tsx:76–82`

```tsx
// Current (problematic spread order)
function SparkIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props} className={className}>
```

**Call site (line ~397):**
```tsx
<SparkIcon className="w-4 h-4" />
```

## Acceptance Criteria

- [ ] `SparkIcon` either uses `{ className?: string }` (Option A) or uses corrected spread order with structural attrs pinned after spread (Option B/C)
- [ ] If reverted: `type SVGProps` import removed from line 3
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] Existing call site `<SparkIcon className="w-4 h-4" />` compiles and renders unchanged

## Work Log

- 2026-04-13: Identified by kieran-typescript-reviewer (spread ordering P2) and code-simplicity-reviewer (YAGNI P2) during PR #9 review. Findings conflict — decision needed.
