---
title: "SparkIcon SVGProps type widening and restoring load-bearing orientation comments"
slug: sparkicon-svgprops-widening-restore-orientation-comments
date: 2026-04-13
category: ui-bugs
tags:
  - typescript
  - svg-components
  - code-review
  - maintainability
  - ui-components
  - load-bearing-comments
  - p3
components:
  - src/components/features/ReviewForm.tsx
  - SparkIcon
symptoms:
  - SparkIcon only accepted `className` prop — TypeScript error when callers pass `aria-label`, `style`, `width`, `height`, or any other SVG attribute
  - Two orientation comments silently removed during cosmetic restyle (PR #8)
  - "`key={i}` on `streamLog.map` lacked explanation, leaving it vulnerable to well-intentioned 'fixes' that cause key churn"
  - "Mount `useEffect` lacked orientation comment in 600-line component, slowing reader comprehension"
root_cause: "PR #8 (dark-teal restyle) extracted SparkIcon with an overly narrow prop type and stripped two load-bearing inline comments as collateral damage during the large rewrite"
severity: p3
related_commits:
  - f5c6760
  - 99f3fc1
related_prs:
  - 8
related_todos:
  - todos/113-complete-p3-sparkicon-svgprops-type.md
  - todos/114-complete-p3-restore-removed-orientation-comments.md
related_docs:
  - docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md
see_also_pending:
  - todos/107-pending-p2-load-bearing-comments-removed.md
---

## Problem

After the dark-teal restyle (PR #8), two categories of regressions were introduced into `ReviewForm.tsx`:

### 1. Narrow prop type on SparkIcon

When `SparkIcon` was extracted as a named sub-component during the restyle, its props were typed from the immediate call site only (`className` was the only prop used there), rather than using the React-idiomatic `SVGProps<SVGSVGElement>`. This produced no TypeScript error at that point — but any future caller passing a standard SVG attribute (`aria-label`, `style`, `width`, `height`, `focusable`, etc.) would get a type error.

### 2. Two load-bearing orientation comments removed

Two inline comments that serve protective/navigational roles were dropped during the code churn of the restyle:

- **Mount `useEffect` comment** — in a 600-line hook-heavy file, this comment orients readers scanning `useEffect` calls. Without it, the effect is easily misidentified.
- **`key={i}` guard on `streamLog.map`** — this comment is actively load-bearing: without it, every static analysis tool, agent, and future reviewer will flag `key={i}` as an anti-pattern and attempt to replace it with a content-derived key, which causes key churn when duplicate log messages appear.

---

## Root Cause

Large cosmetic PRs carry a specific risk: reviewers and authors lower their guard because there is "no logic change." During PR #8's sweep of color tokens and class names across ~600 lines of `ReviewForm.tsx`:

1. `SparkIcon` was freshly extracted from inline JSX and typed to exactly match the one existing call site.
2. Comments inside JSX and before effects were either not copied over or treated as cleanup noise.

Neither regression was caught before merge because no test exercised extra SVG props on `SparkIcon`, and removed comments leave no compile error.

---

## Solution

**Commit:** `f5c6760 fix(polish): widen SparkIcon type to SVGProps and restore two orientation comments`

### Fix 1 — SparkIcon type widening

**File:** `src/components/features/ReviewForm.tsx`

**Before:**
```tsx
import { useState, useEffect, useRef } from 'react'

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 20 20" fill="currentColor" className={className}>
```

**After:**
```tsx
import { useState, useEffect, useRef, type SVGProps } from 'react'

function SparkIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 20 20" fill="currentColor" {...props} className={className}>
```

**Ordering matters:**
- `aria-hidden="true"` is placed **before** `{...props}` so callers can override it for accessible icon buttons (e.g., a standalone icon with no visible label).
- `{...props}` is spread **before** `className` so the caller's `className` always wins.

### Fix 2 — Restore mount `useEffect` orientation comment

```tsx
// On mount: restore from sessionStorage if available
useEffect(() => {
  const saved = readSessionLessons()
  // ...
```

### Fix 3 — Restore append-only `key={i}` guard comment

```tsx
{streamLog.map((entry, i) => (
  // stable enough — entries are append-only
  <li key={i} className={...}>
```

Without this comment, any linter, agent, or reviewer will flag `key={i}` as a React anti-pattern and attempt to replace it — which would cause key collisions if two identical log messages appear, since entries are never reordered.

---

## Investigation Steps

1. PR #8 review (by `kieran-typescript-reviewer` and `code-simplicity-reviewer`) flagged both issues as P3 polish items in todos 113 and 114.
2. The narrow type was traced to `ReviewForm.tsx:76` — the component only existed in this shape because it was freshly extracted during the restyle.
3. The missing comments were cross-referenced against the pre-restyle file to confirm they were present before and inadvertently dropped during rewriting, not intentionally removed.
4. The plan doc (`docs/plans/2026-04-13-fix-sparkicon-type-orientation-comments-plan.md`) evaluated two options for each issue and recommended the zero-risk approach in both cases.

---

## Prevention

### TypeScript: Use `SVGProps<SVGSVGElement>` for all inline SVG components

Any function component wrapping an `<svg>` element must accept `SVGProps<SVGSVGElement>`, not a hand-rolled narrow props object. The narrow type always seems correct at extraction time because the initial call site uses only a subset of props — the problem only surfaces when a second caller needs an additional attribute.

**PR review checklist item:** "Does every newly extracted SVG icon component accept `SVGProps<SVGSVGElement>`?"

### Mark load-bearing comments with `// NOTE:` sentinel

Introduce the convention: comments that must not be removed start with `// NOTE:`. This signals to agents, reviewers, and formatters that the comment is intentional documentation, not cleanup noise.

Examples from this codebase rewritten with the convention:

```tsx
// NOTE: On mount — restore from sessionStorage if available
useEffect(() => {

// NOTE: stable — entries are append-only, index key is safe here
<li key={i}

// NOTE: courseMeta already set from confirmed candidate — selection event is informational only
if (event.type === 'selection') {

// NOTE: silently ignore — SSR environment or private browsing mode
} catch {}
```

A grep for removed `// NOTE:` lines in a PR diff becomes a fast automated check:

```bash
git diff | grep '^-.*// NOTE:'
```

### PR review checklist for cosmetic/restyle PRs

> "For PRs labelled cosmetic/restyle: scan for removed comments. Check every `useEffect`, every `key={}`, every error handler, and every non-obvious state branch for comments that were present before."

### Guidelines: what makes a comment load-bearing?

A load-bearing comment is one that, if removed, causes a future developer or agent to misread the code and introduce a regression. Two criteria:

- **It explains WHY, not WHAT** — if the comment describes what the code does (readable from the code itself), it is decorative. If it explains a non-obvious constraint or intent, it is load-bearing.
- **Its absence would invite a "fix"** — if a reviewer seeing the code without the comment would reasonably conclude it is a bug or anti-pattern and attempt to change it, the comment is load-bearing.

| Location | Comment | Why Load-Bearing |
|---|---|---|
| `streamLog.map key={i}` | `// stable enough — entries are append-only` | Without it, every linter and reviewer flags `key={i}` as anti-pattern |
| Mount `useEffect` | `// On mount: restore from sessionStorage` | 600-line file with multiple effects — prevents misidentification |
| `selection` SSE no-op | `// courseMeta already set from confirmed candidate` | No-op body looks like incomplete handler without comment |
| `writeSessionLessons` catch | `// Silently ignore — SSR or private browsing` | Empty catch looks like swallowed error without explanation |

### Test cases

**Type regression catch** — the narrow type does NOT produce a `tsc` error at the single existing call site. To make the regression detectable, add a second call site in a test or type-assertion file that passes an extra SVG prop:

```tsx
// src/__tests__/types/SparkIcon.typetest.tsx
// If SparkIcon is ever exported, add:
it('accepts and forwards SVG props beyond className', () => {
  const { container } = render(
    <SparkIcon className="w-4 h-4" aria-label="Generate" data-testid="spark" />
  )
  const svg = container.querySelector('svg')
  expect(svg).toHaveAttribute('aria-label', 'Generate')
})
```

This test would have failed to compile against the narrow `{ className?: string }` type, catching the regression before merge.

---

## Related

- **Pending (P2):** `todos/107-pending-p2-load-bearing-comments-removed.md` — four additional architectural comments also removed in PR #8 that are not yet restored: `selection` SSE no-op annotation, partial-lessons error navigation annotation, sessionStorage crash recovery annotation, and silent-catch annotation in `writeSessionLessons`.
- **Architecture pattern:** `docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md` — same theme of types drifting when extracted without forward-thinking.
