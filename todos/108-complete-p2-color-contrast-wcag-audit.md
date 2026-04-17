---
status: complete
priority: p2
issue_id: "108"
tags: [code-review, accessibility, wcag, ui]
dependencies: []
---

# Dark Teal Palette May Fail WCAG AA Contrast Requirements

## Problem Statement

The `add-some-color` restyle introduces several text-on-background color pairings where both colors are in the mid-to-dark range. At least three specific pairings are at elevated risk of failing the WCAG AA 4.5:1 contrast ratio requirement for normal text.

## Findings

**High-risk pairings:**

| Foreground | Background | Where used | Risk |
|---|---|---|---|
| `#3a5e54` | `#0d1b2a` | Eyebrow labels, feature tags, footer, "Start over", "Try an example" label, stream log dots | Very high — both colors are dark |
| `#6a9080` | `#0d1b2a` | Paragraph descriptions, course description, skipped count text | High — mid-teal on dark navy |
| `placeholder: #3d7068 at 60% opacity` | `#08121c` at 80% opacity | URL input placeholder | Likely fails — double opacity reduction |

**Lower-risk pairings (likely fine but should be verified):**

| Foreground | Background | Where used |
|---|---|---|
| `#9dcfc4` | `#0d1b2a` / transparent | Textarea content, stream log done items |
| `#4ec9b0` | `#0d1b2a` / transparent | Pill text, "Start over" hover, example buttons |
| `#ddeee8` | `#0d1b2a` | Headings, lesson titles, course title — likely passes |

**Affected file:** `src/components/features/ReviewForm.tsx` throughout

## Proposed Solutions

### Option A — Lighten the two problem colors (Recommended)

Replace `#3a5e54` → `#5a8f80` (or similar, verify with checker) and `#6a9080` → `#8ab8a8` in all occurrences. These carry the same hue family but have higher luminance against the dark background.

For the placeholder: change `placeholder-[#3d7068]/60` to `placeholder-[#6a9080]/80` — lighter base color, less opacity reduction.

- **Pros:** Maintains the design language while meeting accessibility minimum
- **Effort:** Small | **Risk:** Low (visual-only change)

### Option B — Keep colors, add `aria-hidden` or `role="presentation"` to purely decorative text

For elements that are genuinely decorative (e.g., the eyebrow label dot `·`, the footer text), `aria-hidden` removes them from the accessibility tree so contrast rules don't apply. For actual content (descriptions, labels), this option is not acceptable.

- **Pros:** No visual change
- **Cons:** Only valid for decorative elements; doesn't help descriptions/labels/footer
- **Effort:** Tiny | **Risk:** Low (but doesn't solve the main cases)

## Recommended Action

Option A. Verify each pairing with a contrast checker first (e.g., WebAIM contrast checker), then lighten the two failing colors.

WCAG AA requirements:
- Normal text (< 18pt / < 14pt bold): 4.5:1 minimum
- Large text (≥ 18pt / ≥ 14pt bold): 3:1 minimum

## Technical Details

**Affected file:** `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [x] `#3a5e54` on `#0d1b2a` — replaced with `#5a8f80`
- [x] `#6a9080` on `#0d1b2a` — replaced with `#8ab8a8`
- [x] URL input placeholder — replaced with `placeholder-[#8ab8a8]/80`
- [x] Updated colors applied consistently across all instances in the file

## Work Log

- 2026-04-13: Found by performance-oracle and agent-native-reviewer on `add-some-color` branch review
