---
status: pending
priority: p3
issue_id: "114"
tags: [code-review, documentation, maintainability]
dependencies: []
---

# Two Orientation Comments Removed During Restyle Should Be Restored

## Problem Statement

The `add-some-color` restyle removed two inline comments that are not decorative — they orient a reader scanning the component and protect against incorrect "fixes" by future maintainers or agents.

This is a continuation of the same category as todo #107 (load-bearing comments), but for two comments that were missed in that pass.

## Findings

**1. `key={i}` on the append-only streamLog list (line ~527 in the new file)**

The comment `// stable enough — entries are append-only` was removed from the `streamLog.map()` call. Without it, every static analysis tool and every code reviewer will flag `key={i}` as an anti-pattern and "fix" it (e.g., by using `entry.text` as key, which would cause key collisions if two identical log messages appear). The comment explains precisely why array-index keys are safe here: the list is append-only during a component lifecycle and entries never reorder.

Original context:
```tsx
{streamLog.map((entry, i) => (
  // stable enough — entries are append-only
  <li key={i} className={...}>
```

**2. `useEffect` mount comment (line ~100)**

The comment `// On mount: restore from sessionStorage if available` was removed from the `useEffect` that reads `readSessionLessons()` / `readSessionMeta()`. In a 600-line component with multiple effects, this comment provides immediate orientation — a reader scanning the hook section understands the effect's purpose without parsing the `readSessionLessons` and `readSessionMeta` function calls.

Original context:
```tsx
// On mount: restore from sessionStorage if available
useEffect(() => {
  const saved = readSessionLessons()
  const meta = readSessionMeta()
```

**Raised by:** kieran-typescript-reviewer (P3-A), code-simplicity-reviewer (P3)

## Proposed Solutions

### Option A — Restore both comments in place (Recommended)

Re-add each comment at the appropriate location. No logic change.

```tsx
// On mount: restore from sessionStorage if available
useEffect(() => {
  const saved = readSessionLessons()
```

```tsx
{streamLog.map((entry, i) => (
  // stable enough — entries are append-only
  <li key={i}
```

- **Effort:** Tiny | **Risk:** None

### Option B — Use a React key alternative for streamLog

Replace `key={i}` with a stable key derived from content + index:
```tsx
<li key={`${i}-${entry.text.slice(0, 20)}`}
```
This makes the key self-documenting and removes the need for the comment.

- **Pros:** Eliminates the lint warning without a comment
- **Cons:** More complex key; `entry.text` can be long; still not guaranteed unique
- **Effort:** Small | **Risk:** Low

## Recommended Action

Option A for both. Restoring comments is the zero-risk fix.

## Technical Details

**Affected file:** `src/components/features/ReviewForm.tsx`
- `useEffect` comment: ~line 100
- `streamLog.map` comment: ~line 527

## Acceptance Criteria

- [ ] `// On mount: restore from sessionStorage if available` restored before the mount `useEffect`
- [ ] `// stable enough — entries are append-only` restored on the `streamLog.map` key={i}

## Work Log

- 2026-04-13: Found by kieran-typescript-reviewer and code-simplicity-reviewer on `add-some-color` branch review
