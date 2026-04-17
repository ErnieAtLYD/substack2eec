---
status: pending
priority: p2
issue_id: "112"
tags: [code-review, ui, css, architecture]
dependencies: ["109", "110"]
---

# Root Div Background Color Defined in Three Places

## Problem Statement

The dark navy background `#0d1b2a` is now defined in three separate locations that are not linked to each other:

1. `globals.css` — `--background: #0d1b2a` (CSS custom property)
2. `globals.css` — `body { background: var(--background) }` (applied to body)
3. `ReviewForm.tsx` — `bg-[#0d1b2a]` on the root `<div>` (hardcoded Tailwind class)

The body already has the dark background via the CSS token. The `bg-[#0d1b2a]` on the root div is redundant. If the background color is updated in the token, the body will update but the component root will silently stay on the old color.

## Findings

**Affected locations:**

- `src/app/globals.css:4` — `--background: #0d1b2a`
- `src/app/globals.css:8` — `body { background: var(--background) }`
- `src/components/features/ReviewForm.tsx:330` — `bg-[#0d1b2a]` on root `<div>`

The root div also has an inline `style` prop with a radial gradient (see todo #110). That gradient uses `rgba(0,200,180,0.12)` and `rgba(30,80,140,0.25)` — magic RGBA literals that correspond to `#00c8a8` (teal brand) and approximately `#1e508c` (dark blue) but have no link to any design token. If the brand teal `#00c8a8` changes, the gradient ambient light won't follow.

**Raised by:** kieran-typescript-reviewer (P1-B → downgraded to P2), performance-oracle (P3)

## Proposed Solutions

### Option A — Replace `bg-[#0d1b2a]` with `bg-background` (Recommended)

```tsx
// Before
<div className="flex flex-col min-h-screen bg-[#0d1b2a]" style={...}>

// After
<div className="flex flex-col min-h-screen bg-background" style={...}>
```

`bg-background` resolves to `var(--background)` via Tailwind's CSS variable integration. If the color ever changes, both the body and the component root update from one place. If the `body` background is already sufficient and nothing overrides it, the `bg-background` class can also be removed entirely.

- **Pros:** Token-driven, zero visual change, single source of truth
- **Effort:** Tiny | **Risk:** None

### Option B — Remove `bg-[#0d1b2a]` entirely

The body already sets `background: var(--background)`. If `ReviewForm`'s root div is `min-h-screen` (which it is), the body color shows through. Remove the class entirely.

- **Pros:** Less code, relies on CSS cascade correctly
- **Cons:** Slightly less explicit — a reader must know the body is already dark
- **Effort:** Tiny | **Risk:** None

### Option C — Also fix gradient RGBA literals (do together with #110)

When addressing todo #110 (move gradient to CSS), replace the `rgba(0,200,180,...)` literal with a reference to the `#00c8a8` token:

```css
/* globals.css */
.page-bg {
  background-image:
    radial-gradient(at 15% 20%, rgb(from var(--color-brand) r g b / 0.12) 0px, transparent 55%),
    radial-gradient(at 85% 75%, rgba(30, 80, 140, 0.25) 0px, transparent 50%);
}
```

- **Effort:** Small | **Risk:** Low

## Recommended Action

Option A for the immediate `bg-[#0d1b2a]` fix. Coordinate with #110 for the gradient RGBA literals.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:330`
- `src/app/globals.css:4,8`

## Acceptance Criteria

- [ ] `bg-[#0d1b2a]` on root `<div>` replaced with `bg-background` or removed
- [ ] Background color has a single source of truth in `globals.css`
- [ ] Visual appearance unchanged

## Work Log

- 2026-04-13: Found by kieran-typescript-reviewer and performance-oracle on `add-some-color` branch review
