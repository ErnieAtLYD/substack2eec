---
status: complete
priority: p3
issue_id: "109"
tags: [code-review, maintainability, tailwind, css]
dependencies: []
---

# Hex Color Literals Duplicated Across ReviewForm.tsx — No Single Source of Truth

## Problem Statement

The `add-some-color` restyle introduces ~8–10 palette hex values as repeated Tailwind arbitrary values throughout `ReviewForm.tsx`. These appear ~70 times across the JSX. A single color tweak or brand change requires a grep-and-replace across the entire component rather than a one-line edit in `globals.css`. Tailwind v4's `@theme inline` block already exists in `globals.css` and supports this pattern — it just isn't used for the new palette.

## Findings

**Repeated hex values and approximate occurrence counts in `ReviewForm.tsx`:**

| Value | Used as | Approx occurrences |
|---|---|---|
| `#00c8a8` | primary teal (borders, bg, icons, buttons) | ~25 |
| `#3a5e54` | dim teal (labels, tags, footer) | ~10 |
| `#ddeee8` | light text (headings, titles) | ~8 |
| `#6a9080` | mid-muted (descriptions) | ~6 |
| `#4ec9b0` | mid-teal (pill text, links) | ~6 |
| `#052118` | dark ink (button text on teal) | ~5 |
| `#9dcfc4` | light teal (textarea, done items) | ~4 |
| `#0fe0bc` | hover teal (button hover) | ~3 |
| `#08121c` | deep ink (input bg) | ~2 |

**`globals.css` already has the infrastructure:**

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

This block is the correct place to register the new tokens so Tailwind generates utility classes from them.

## Proposed Solutions

### Option A — Register palette in `globals.css`, bulk-replace in ReviewForm.tsx (Recommended)

**Step 1 — add to `:root` in `globals.css`:**
```css
--teal-primary:   #00c8a8;
--teal-hover:     #0fe0bc;
--teal-accent:    #5ee8c8;
--teal-mid:       #4ec9b0;
--teal-light:     #9dcfc4;
--teal-subtle:    #6a9080;
--teal-dim:       #3a5e54;
--ink-dark:       #0d1b2a;
--ink-deeper:     #08121c;
--ink-on-teal:    #052118;
```

**Step 2 — register in `@theme inline`:**
```css
@theme inline {
  ...existing...
  --color-teal-primary:  var(--teal-primary);
  --color-teal-hover:    var(--teal-hover);
  --color-teal-mid:      var(--teal-mid);
  --color-teal-light:    var(--teal-light);
  --color-teal-subtle:   var(--teal-subtle);
  --color-teal-dim:      var(--teal-dim);
  --color-ink-dark:      var(--ink-dark);
  --color-ink-deeper:    var(--ink-deeper);
  --color-ink-on-teal:   var(--ink-on-teal);
}
```

**Step 3 — replace arbitrary values in ReviewForm.tsx:**
- `text-[#6a9080]` → `text-teal-subtle`
- `bg-[#00c8a8]` → `bg-teal-primary`
- `text-[#052118]` → `text-ink-on-teal`
- etc.

Opacity modifiers still work: `border-[#00c8a8]/15` → `border-teal-primary/15`

- **Pros:** Single source of truth; palette changes require one edit; JSX becomes self-documenting; Tailwind autocomplete works with named tokens
- **Effort:** Medium (mechanical find/replace) | **Risk:** Low

### Option B — Leave as-is (arbitrary hex literals)

The current approach is functional and Tailwind v4 handles it. The cost is maintainability, not correctness.

- **Effort:** None | **Risk:** None (no change)

## Recommended Action

Option A. The palette is large and repeated enough that token centralization pays off before a second feature needs to touch any color. Do this as a follow-up PR after the restyle lands — don't hold the restyle for it.

## Technical Details

**Affected files:**
- `src/app/globals.css` (add tokens)
- `src/components/features/ReviewForm.tsx` (bulk replace)

## Acceptance Criteria

- [ ] All repeated hex palette values registered as CSS custom properties in `globals.css`
- [ ] Tailwind `@theme inline` block registers named color tokens
- [ ] `ReviewForm.tsx` uses named token classes instead of arbitrary hex values
- [ ] Visual output unchanged

## Work Log

- 2026-04-13: Found by code-simplicity-reviewer on `add-some-color` branch review
