---
status: pending
priority: p2
issue_id: "111"
tags: [code-review, ui, tailwind, accessibility]
dependencies: ["109"]
---

# Non-Standard Tailwind Opacity Modifiers Throughout ReviewForm

## Problem Statement

The `add-some-color` restyle introduced several Tailwind opacity modifier values that are not multiples of 5: `/7`, `/18`, and `/22`. These create orphaned CSS custom properties, are visually indistinguishable from their nearest standard neighbors, and confuse future contributors who need to match a surface. Tailwind v4 generates a separate CSS rule for each unique modifier value — non-standard values cannot reuse existing rules from the standard scale.

## Findings

**Affected locations in `src/components/features/ReviewForm.tsx`:**

| Value | Line(s) | Standard alternative | Visual difference |
|---|---|---|---|
| `bg-[#00c8a8]/7` | ~418 (example buttons) | `/5` or `/10` | None perceptible |
| `border-[#00c8a8]/18` | ~386, ~592 | `/20` | None perceptible |
| `border-[#00c8a8]/22` | ~396 | `/20` or `/25` | None perceptible |

Additionally, two notation styles are used for opacity on the same class type:
- `bg-white/[0.04]` — decimal bracket notation (4%)
- `bg-[#00c8a8]/7` — integer percent notation (7%)

These represent similar "faint tint" surfaces but use different syntax. All card surfaces should use the same value and notation.

**Raised by:** kieran-typescript-reviewer (P2-B, P2-C, P2-D), performance-oracle (P2), code-simplicity-reviewer (P2)

## Proposed Solutions

### Option A — Normalize all opacity modifiers to multiples of 5 (Recommended)

```tsx
// Before → After
bg-[#00c8a8]/7     →  bg-[#00c8a8]/10
border-[#00c8a8]/18  →  border-[#00c8a8]/20
border-[#00c8a8]/22  →  border-[#00c8a8]/20
bg-white/[0.04]    →  bg-white/5
```

- **Pros:** Eliminates orphaned CSS rules, consistent scale, find-and-replace is trivial
- **Cons:** Marginal visual change (< 3% opacity difference, imperceptible)
- **Effort:** Tiny | **Risk:** None

### Option B — Move all opacities into CSS tokens

Define `--opacity-card`, `--opacity-border` etc. in `globals.css` and reference via Tailwind `@theme`. Pairs well with todo #109 (centralize hex colors).

- **Pros:** Single source of truth; more change-safe
- **Cons:** Requires #109 to be done first
- **Effort:** Small | **Risk:** None

## Recommended Action

Option A immediately; revisit as part of Option B when #109 is addressed.

## Technical Details

**Affected file:** `src/components/features/ReviewForm.tsx`

Tailwind v4 (confirmed in `package.json`: `"tailwindcss": "^4"`) generates a CSS custom property per unique opacity modifier. `/7` creates `--tw-bg-opacity: 0.07` as an isolated rule used exactly once. Browsers do not de-duplicate across custom properties, so each non-standard value adds a unique CSS declaration.

## Acceptance Criteria

- [ ] All Tailwind opacity modifiers in `ReviewForm.tsx` are multiples of 5
- [ ] `bg-white/[0.04]` and `bg-[#00c8a8]/7` unified to the same value and notation
- [ ] No instances of `/7`, `/18`, or `/22` remain in the file
- [ ] Visual appearance unchanged (verify in browser)

## Work Log

- 2026-04-13: Found by kieran-typescript-reviewer, performance-oracle, code-simplicity-reviewer on `add-some-color` branch review
