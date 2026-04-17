---
title: "refactor: Centralize palette hex literals as CSS tokens (todo 109)"
type: refactor
status: completed
date: 2026-04-16
---

# refactor: Centralize Palette Hex Literals as CSS Tokens

`ReviewForm.tsx` repeats 11 hex values ~78 times via Tailwind bracket syntax (`bg-[#00c8a8]`). `globals.css` already has the `:root` + `@theme inline` infrastructure. This refactor moves every hex value into a named token and bulk-replaces the arbitrary bracket values with token class names.

Two tokens already exist and should be reused, not duplicated:
- `#ddeee8` → `text-foreground` (already `--color-foreground`)
- `#0d1b2a` → `bg-background` (already `--color-background`)

---

## Token Mapping

**Step 1 — add to `:root` in `globals.css` (after `--foreground`):**

```css
--teal-primary:   #00c8a8;
--teal-hover:     #0fe0bc;
--teal-accent:    #5ee8c8;
--teal-lightest:  #9eeedd;
--teal-mid:       #4ec9b0;
--teal-light:     #9dcfc4;
--teal-subtle:    #8ab8a8;
--teal-dim:       #5a8f80;
--ink-deeper:     #08121c;
--ink-on-teal:    #052118;
```

**Step 2 — add to `@theme inline` block in `globals.css`:**

```css
--color-teal-primary:   var(--teal-primary);
--color-teal-hover:     var(--teal-hover);
--color-teal-accent:    var(--teal-accent);
--color-teal-lightest:  var(--teal-lightest);
--color-teal-mid:       var(--teal-mid);
--color-teal-light:     var(--teal-light);
--color-teal-subtle:    var(--teal-subtle);
--color-teal-dim:       var(--teal-dim);
--color-ink-deeper:     var(--ink-deeper);
--color-ink-on-teal:    var(--ink-on-teal);
```

**Step 3 — bulk-replace in `ReviewForm.tsx`:**

The pattern is mechanical: `[#HEX]` → `TOKEN-NAME` (brackets removed, prefix utility unchanged, opacity modifiers survive).

| Find (regex) | Replace | Occurrences | Note |
|---|---|---|---|
| `\[#00c8a8\]` | `teal-primary` | 33 | Primary teal |
| `\[#5a8f80\]` | `teal-dim` | 11 | Dim/footer text |
| `\[#4ec9b0\]` | `teal-mid` | 8 | Secondary teal |
| `\[#ddeee8\]` | `foreground` | 6 | Already tokenized |
| `\[#8ab8a8\]` | `teal-subtle` | 7 | Muted body text |
| `\[#052118\]` | `ink-on-teal` | 4 | Dark text on teal |
| `\[#9dcfc4\]` | `teal-light` | 3 | Input/done text |
| `\[#0fe0bc\]` | `teal-hover` | 3 | Hover teal |
| `\[#9eeedd\]` | `teal-lightest` | 1 | Badge hover text |
| `\[#5ee8c8\]` | `teal-accent` | 1 | Em highlight |
| `\[#08121c\]` | `ink-deeper` | 1 | Input background |

Total: 78 replacements. Zero logic changes.

---

## Acceptance Criteria

- [x] All 10 new tokens defined in `:root` in `globals.css`
- [x] All 10 new tokens registered in `@theme inline` in `globals.css`
- [x] `ReviewForm.tsx` contains zero `[#` bracket-hex color instances
- [x] `#ddeee8` occurrences replaced with `foreground` token (not a new token)
- [x] Opacity modifiers preserved (`border-teal-primary/20` etc.)
- [x] `npm run build` passes with no TypeScript errors
- [ ] Visual appearance unchanged (verify in browser: all steps of the pipeline)

---

## Implementation Order

1. Edit `src/app/globals.css` — add `:root` vars, then `@theme inline` entries
2. Bulk-replace `ReviewForm.tsx` using the table above (11 find/replace passes)
3. Verify zero `[#` hex instances remain: `grep -c '\[#' ReviewForm.tsx`
4. Run `npm run build`

Single commit. No tests to update.

---

## Sources

- Todo: `todos/109-pending-p3-hex-colors-not-centralized.md`
- Affected files: `src/app/globals.css`, `src/components/features/ReviewForm.tsx`
- Existing token pattern established at: `src/app/globals.css:3–13`
