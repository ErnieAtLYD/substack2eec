---
title: "fix: SparkIcon SVGProps type and restore two orientation comments (todos 113–114)"
type: fix
status: completed
date: 2026-04-13
---

# fix: SparkIcon SVGProps Type and Restore Orientation Comments (todos 113–114)

Two P3 polish fixes in `src/components/features/ReviewForm.tsx`. No logic changes.

---

## Issue 113 — SparkIcon Should Accept `React.SVGProps<SVGSVGElement>`

### Problem

`SparkIcon` currently accepts only `{ className?: string }`. Any caller needing to pass a standard SVG attribute (`aria-label`, `style`, `width`, `height`, etc.) will get a TypeScript error. The narrowness is unnecessary — `React.SVGProps<SVGSVGElement>` is a one-line drop-in that covers all standard SVG attributes and is future-proof.

**Affected location:** `src/components/features/ReviewForm.tsx:76`

```tsx
// Current
function SparkIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" ... className={className}>

// Fix
function SparkIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" ... {...props} className={className}>
```

Note: `{...props}` spreads before `className` so the caller's className wins; `aria-hidden` is hardcoded before `{...props}` so it can be overridden by a caller that needs accessible icon semantics.

### Acceptance Criteria

- [x] `SparkIcon` accepts `SVGProps<SVGSVGElement>` (named import from react)
- [x] Existing call site `<SparkIcon className="w-4 h-4" />` compiles and renders unchanged
- [x] TypeScript strict mode passes

---

## Issue 114 — Restore Two Removed Orientation Comments

### Problem

Two inline comments that orient a reader scanning the 600-line component were removed during the restyle. Without them, the intent of a mount effect and a non-obvious `key` choice must be inferred from code.

**1. `useEffect` mount comment — `ReviewForm.tsx:100`**

```tsx
// Restore before the useEffect:
// On mount: restore from sessionStorage if available
useEffect(() => {
  const saved = readSessionLessons()
```

**2. `streamLog.map` key comment — `ReviewForm.tsx:519`**

```tsx
// Restore on the li element:
{streamLog.map((entry, i) => (
  // stable enough — entries are append-only
  <li key={i} className={...}>
```

Without the second comment, every static analysis tool and future reviewer will flag `key={i}` as an anti-pattern and attempt to "fix" it — potentially introducing key churn on re-renders.

### Acceptance Criteria

- [x] `// On mount: restore from sessionStorage if available` present before `useEffect` at line ~100
- [x] `// stable enough — entries are append-only` present on `streamLog.map` `<li key={i}>`

---

## Implementation Order

1. **#113** — widen `SparkIcon` prop type (3 lines changed)
2. **#114** — add 2 comments (2 lines added)

Single commit. No tests needed (type-only + comment-only changes).

## Sources

- Todo 113: `todos/113-pending-p3-sparkicon-svgprops-type.md`
- Todo 114: `todos/114-pending-p3-restore-removed-orientation-comments.md`
- Affected file: `src/components/features/ReviewForm.tsx`
