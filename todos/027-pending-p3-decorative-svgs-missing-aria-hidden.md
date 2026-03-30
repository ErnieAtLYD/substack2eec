---
status: done
priority: p3
issue_id: "027"
tags: [code-review, accessibility]
dependencies: []
---

# Decorative SVG Icons Missing `aria-hidden="true"`

## Problem Statement

PR #3 added two decorative SVG icons — a graduation cap in the page hero and an open book in the input card. Both are purely presentational (no semantic meaning, no interactive purpose). Without `aria-hidden="true"`, screen readers will attempt to read them, producing an empty or confusing announcement (the SVG has no `title` or `aria-label`).

**Why it matters:** Screen reader users get unexpected noise from decorative SVGs without `aria-hidden`. This is a WCAG 2.1 Level A violation (1.1.1 Non-text Content).

## Findings

**Location 1:** `src/components/features/ReviewForm.tsx:288–292` — page hero graduation cap SVG

```tsx
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ...>
  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
  <path d="M6 12v5c3 3 9 3 12 0v-5" />
</svg>
```

**Location 2:** `src/components/features/ReviewForm.tsx:313–317` — input card open book SVG

```tsx
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ...>
  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
</svg>
```

Both SVGs are wrapped in decorative `div` containers with no labeling. Screen readers will either skip them (if the browser is smart) or announce an empty element.

**Also affects:** The submit button's two decorative SVG icons (sparkle and arrow at lines 339–344) — same issue.

## Proposed Solutions

### Option A: Add `aria-hidden="true"` to all decorative SVGs (Recommended)
```tsx
<svg aria-hidden="true" focusable="false" ...>
```
- `aria-hidden="true"` hides the element from the accessibility tree
- `focusable="false"` prevents IE11 from focusing SVGs (legacy, but good practice)
- **Effort:** Trivial — add two attributes to each SVG
- **Risk:** None

### Option B: Add a `<title>` element inside each SVG
```tsx
<svg role="img" aria-labelledby="icon-hero">
  <title id="icon-hero">Graduation cap icon</title>
  ...
</svg>
```
- **Pros:** Provides meaningful description for screen readers
- **Cons:** Overkill for purely decorative icons that add no information
- **Effort:** Small
- **Risk:** None

## Recommended Action

Option A for purely decorative icons. Option B is appropriate only for icons that carry semantic meaning.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:288` — hero SVG
- `src/components/features/ReviewForm.tsx:313` — card SVG
- `src/components/features/ReviewForm.tsx:339, 343` — submit button SVGs

## Acceptance Criteria

- [ ] All decorative SVGs have `aria-hidden="true"`
- [ ] Screen reader testing: VoiceOver/NVDA does not announce the icons
- [ ] No WCAG 1.1.1 violations for decorative images

## Work Log

- 2026-03-28: Finding created from PR #3 code review (feat/ui-redesign-centered-layout)

## Resources

- PR #3: feat(ui): redesign homepage with centered card layout
- TypeScript reviewer finding: "P3 — Duplicate decorative SVGs lack aria-hidden"
- WCAG 2.1 SC 1.1.1: https://www.w3.org/TR/WCAG21/#non-text-content
