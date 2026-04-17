---
title: "fix: Resolve add-some-color branch review issues (todos 106–108)"
type: fix
status: completed
date: 2026-04-13
---

# fix: Resolve add-some-color branch review issues (todos 106–108)

Three P2 bugs found by code review on the `add-some-color` branch, all in `src/components/features/ReviewForm.tsx`. Each fix is small and independent; they can be resolved in a single commit.

---

## Issue 106 — URL Input Placeholder Missing `https://` Scheme

### Problem

`<input type="url">` requires an absolute URL with a scheme for HTML5 validation to pass. The placeholder was changed from `https://yourname.substack.com` to `yourname.substack.com`, so users who type exactly what the placeholder shows will get a silent browser validation failure.

**Affected location:** `src/components/features/ReviewForm.tsx:390`

```tsx
// Current — breaks browser validation
placeholder="yourname.substack.com"

// Fix — restore the scheme
placeholder="https://yourname.substack.com"
```

### Acceptance Criteria

- [x] URL input placeholder reads `https://yourname.substack.com`
- [x] Typing the placeholder value verbatim passes browser form validation

---

## Issue 107 — Load-Bearing Comments Removed in Restyle

### Problem

Four inline comments documenting non-obvious architectural decisions were stripped during the visual restyle. Without them, correct code paths look like bugs and are at risk of being "cleaned up" incorrectly.

**Affected file:** `src/components/features/ReviewForm.tsx`

### Fixes Required

**1. `selection` SSE event — informational only (`~line 226`)**

```typescript
// courseMeta already set from confirmed candidate — selection event is informational only
if (event.type === 'selection') {
```

**2. Partial-lessons error recovery — navigate to review (`~line 243`)**

```typescript
// If we have partial lessons, let user review what arrived
if (inProgressLessons.length > 0) {
```

**3. Stream crash recovery from sessionStorage (`~line 255`)**

```typescript
// Recover partial lessons from sessionStorage if stream died
const saved = readSessionLessons()
```

**4. Silent catch in `writeSessionLessons` — end of catch block (`~line 59`)**

```typescript
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[substack2eec] sessionStorage quota exceeded — lesson progress will not be saved on refresh')
    }
    // Silently ignore other errors (SSR environment, private browsing, etc.)
  }
```

### Acceptance Criteria

- [x] `selection` event handler has comment explaining it is informational only
- [x] Partial-lessons error recovery path has comment explaining navigation to review
- [x] Stream crash recovery has comment explaining the sessionStorage re-read
- [x] `writeSessionLessons` silent catch has comment for SSR/private-browsing context

---

## Issue 108 — Dark Teal Palette May Fail WCAG AA Contrast

### Problem

Three text-on-background color pairings introduced in the restyle are at elevated risk of failing the 4.5:1 WCAG AA contrast ratio requirement for normal text.

**Affected file:** `src/components/features/ReviewForm.tsx` (Tailwind inline color classes throughout)

### High-Risk Pairings

| Foreground | Background | Where used |
|---|---|---|
| `#3a5e54` | `#0d1b2a` | Eyebrow labels, feature tags, footer, "Start over", stream log dots |
| `#6a9080` | `#0d1b2a` | Paragraph descriptions, course description, skipped count text |
| `placeholder-[#3d7068]/60` | `#08121c` at 80% opacity | URL input placeholder |

### Fix

Replace the two failing foreground colors with higher-luminance equivalents in the same hue family. Verify each pairing with a contrast checker (e.g., WebAIM) before committing.

```
#3a5e54  →  #5a8f80  (or similar — verify ≥ 4.5:1 against #0d1b2a)
#6a9080  →  #8ab8a8  (or similar — verify ≥ 4.5:1 against #0d1b2a)
placeholder-[#3d7068]/60  →  placeholder-[#6a9080]/80
```

Replace **all occurrences** of each color in the file — use a global find-and-replace to avoid missing instances.

### Acceptance Criteria

- [x] `#3a5e54` on `#0d1b2a` — replaced with `#5a8f80`
- [x] `#6a9080` on `#0d1b2a` — replaced with `#8ab8a8`
- [x] URL input placeholder — replaced with `placeholder-[#8ab8a8]/80`
- [x] Updated colors applied consistently across all instances in the file

---

## Implementation Order

1. **#107** first — comment-only changes, zero risk
2. **#106** — one word change
3. **#108** — color replacements; verify contrast ratios before applying

## Sources

- Todo 106: `todos/106-pending-p2-url-input-placeholder-scheme-missing.md`
- Todo 107: `todos/107-pending-p2-load-bearing-comments-removed.md`
- Todo 108: `todos/108-pending-p2-color-contrast-wcag-audit.md`
- Affected file: `src/components/features/ReviewForm.tsx`
