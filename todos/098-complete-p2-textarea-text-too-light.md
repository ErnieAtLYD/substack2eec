---
status: pending
priority: p2
issue_id: "098"
tags: [bug, ui, accessibility, contrast]
dependencies: []
---

# Textarea Text Color Too Light — Low Contrast on White Background

## Problem Statement

The text inside lesson body textareas renders in a very light gray color against the white background, making it difficult to read. The content is editable markdown and users need to read and edit it — low contrast here is both a readability and accessibility issue (likely fails WCAG AA contrast ratio of 4.5:1).

## Findings

- **Affected component:** `src/components/features/ReviewForm.tsx` — the lesson `<textarea>` elements in the review step
- **Symptom:** Text appears light gray (~`text-gray-300` or similar) instead of near-black
- **Root cause:** Likely a missing or incorrect Tailwind text color class on the textarea, causing it to inherit a muted color (possibly from a parent or from the default browser textarea color being overridden by a global style)
- **Screenshot:** Provided — all textarea content is visibly too light across multiple lesson cards

## Proposed Solutions

### Option A — Add explicit text color class to textarea (Recommended)
Add `text-gray-900` (or `text-gray-800`) to the textarea's className. This forces near-black text regardless of any inherited styles.

**Effort:** Trivial | **Risk:** None

### Option B — Check for a global CSS rule overriding textarea color
If a global stylesheet sets `textarea { color: ... }` to something light, override it specifically for these textareas.

**Effort:** Small | **Risk:** None

## Acceptance Criteria

- [ ] Textarea text is readable at normal viewing distance
- [ ] Text color passes WCAG AA contrast ratio (4.5:1) against white background
- [ ] Fix applies to all lesson body textareas in the review step

## Work Log

- 2026-04-04: Filed by user with screenshot — all lesson textareas affected
