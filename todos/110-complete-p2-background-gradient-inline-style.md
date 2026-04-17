---
status: pending
priority: p2
issue_id: "110"
tags: [code-review, css, maintainability, tailwind]
dependencies: ["109"]
---

# Radial Gradient Background Implemented as Inline `style` Prop

## Problem Statement

The root `div` in `ReviewForm.tsx` uses an inline `style` prop to apply two radial gradient decorations. This is a static decoration that never changes dynamically — it belongs in CSS, not in JSX. The inline style bypasses Tailwind's class system, generates a new object literal on each render, and cannot be cached by the browser's CSSOM.

## Findings

**Current implementation (`ReviewForm.tsx` line ~326):**
```tsx
<div className="flex flex-col min-h-screen bg-[#0d1b2a]"
  style={{
    backgroundImage: `
      radial-gradient(at 15% 20%, rgba(0,200,180,0.12) 0px, transparent 55%),
      radial-gradient(at 85% 75%, rgba(30,80,140,0.25) 0px, transparent 50%)
    `
  }}
>
```

The `backgroundImage` value is a string literal with no reactive expression — it never changes. It is used on the single root element of the only page in this app.

## Proposed Solutions

### Option A — Move gradient to a CSS class in `globals.css` (Recommended)

```css
/* globals.css */
.page-gradient {
  background-image:
    radial-gradient(at 15% 20%, rgba(0,200,180,0.12) 0px, transparent 55%),
    radial-gradient(at 85% 75%, rgba(30,80,140,0.25) 0px, transparent 50%);
}
```

```tsx
{/* ReviewForm.tsx */}
<div className="flex flex-col min-h-screen bg-[#0d1b2a] page-gradient">
```

- **Pros:** Removes object literal from render; CSSOM-cacheable; keeps all visual declarations in CSS; easier to tweak without touching JSX
- **Effort:** Tiny | **Risk:** None

### Option B — Register as a Tailwind `@utility` in `globals.css`

Tailwind v4 supports:
```css
@utility page-gradient {
  background-image:
    radial-gradient(at 15% 20%, rgba(0,200,180,0.12) 0px, transparent 55%),
    radial-gradient(at 85% 75%, rgba(30,80,140,0.25) 0px, transparent 50%);
}
```

Same result as Option A but registered through the Tailwind utility layer.

- **Effort:** Tiny | **Risk:** None

## Recommended Action

Option A or B — either works. Combine with todo #109 (palette token centralization) in the same follow-up PR.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx`
- `src/app/globals.css`

## Acceptance Criteria

- [ ] `backgroundImage` removed from inline `style` prop on root div
- [ ] Gradient defined as a CSS class or `@utility` in `globals.css`
- [ ] Visual output unchanged

## Additional Context

**Performance (performance-oracle):** The inline object literal is created on every render. During the `generating` step, `setStreamLog` and `setCompletedLessonCount` fire per SSE chunk (5–15 renders in quick succession). React sees a new object reference each render and dispatches a DOM `style` write even though the value never changes. Moving to a CSS class or a module-level constant (`const ROOT_BG_STYLE = { backgroundImage: '...' } as const`) eliminates all per-render allocation.

**CSP (security-sentinel):** No CSP is configured today, so no current failure. If a strict `style-src` CSP is added (`style-src 'self'`), this inline style will be silently blocked and the gradient will disappear. A CSS class removes the risk entirely.

## Work Log

- 2026-04-13: Found by code-simplicity-reviewer and performance-oracle on `add-some-color` branch review
- 2026-04-13: Upgraded P3 → P2; added performance (per-render allocation during SSE) and CSP forward-risk notes
