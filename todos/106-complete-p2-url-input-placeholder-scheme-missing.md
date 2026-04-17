---
status: complete
priority: p2
issue_id: "106"
tags: [code-review, ux, accessibility, forms]
dependencies: []
---

# URL Input Placeholder Mismatches `type="url"` Validation

## Problem Statement

The URL input in the `input` step of `ReviewForm.tsx` uses `type="url"` (which requires a valid URL including scheme) but the placeholder was changed to `yourname.substack.com` — omitting `https://`. A user who types exactly what the placeholder shows will fail HTML5 form validation and get no useful error message explaining why.

## Findings

**Affected location:** `src/components/features/ReviewForm.tsx` — the `<input type="url">` in the `step === 'input'` block.

```tsx
// Current — placeholder mismatches type="url" requirement
<input
  type="url"
  value={url}
  ...
  placeholder="yourname.substack.com"   // ← no https:// scheme
  required
/>
```

`type="url"` validation requires the value to be a valid absolute URL with a scheme (`https://`). The old placeholder was `https://yourname.substack.com` which correctly demonstrated the expected format. The new placeholder demonstrates an invalid format.

Users who type `noahpinion.substack.com` will see a browser validation error on submit with no clear guidance on what's wrong.

## Proposed Solutions

### Option A — Restore the scheme in the placeholder (Recommended)

```tsx
placeholder="https://yourname.substack.com"
```

- **Pros:** Correct, zero-effort, matches browser validation requirement
- **Effort:** Tiny | **Risk:** None

### Option B — Remove `type="url"` and use custom validation

Change `type="text"` and validate server-side (which already happens in `/api/fetch-posts`). Allows scheme-free input, which the server normalizes anyway.

- **Pros:** More forgiving UX — matches how the backend actually works
- **Cons:** Loses browser's built-in URL format hinting; keyboard on mobile shows text keyboard instead of URL keyboard
- **Effort:** Small | **Risk:** Low

## Recommended Action

Option A. One word change. The server normalizes URLs, but the UI should still show the expected format.

## Technical Details

**Affected file:** `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [x] URL input placeholder includes `https://` scheme
- [x] Typing the placeholder value verbatim passes browser validation

## Work Log

- 2026-04-13: Found by agent-native-reviewer on `add-some-color` branch review
