---
status: pending
priority: p2
issue_id: "023"
tags: [code-review, ux, form-validation]
dependencies: []
---

# URL Input Placeholder Misleads Users — `type="url"` Requires a Full URL with Scheme

## Problem Statement

The URL input's placeholder was changed from `https://example.substack.com` to `yourname.substack.com` in PR #3. The input type remains `type="url"`. HTML's `type="url"` requires a valid URL per the WHATWG spec, which mandates a scheme (`https://`). A user who reads the placeholder literally and types `yourname.substack.com` will fail browser-native validation with an unhelpful browser error before any app logic runs.

**Why it matters:** The placeholder is the primary affordance teaching users what to enter. The old placeholder (`https://example.substack.com`) was correct. The new one (`yourname.substack.com`) is misleading and will cause user confusion on the first try.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:331`

```tsx
<input
  type="url"
  value={url}
  onChange={e => setUrl(e.target.value)}
  placeholder="yourname.substack.com"   // ← no scheme
  required
  ...
/>
```

- `type="url"` uses WHATWG URL parsing: bare hostnames without `https://` are invalid
- Browser shows "Please enter a URL" (or similar) when the user submits a bare hostname
- The example buttons (todo 022) correctly set full URLs like `https://lenny.substack.com`, so the placeholder is inconsistent with the examples' format

## Proposed Solutions

### Option A: Fix the placeholder (Recommended)
```tsx
placeholder="https://yourname.substack.com"
```
- **Pros:** One-character fix, correct format, consistent with examples
- **Effort:** Trivial
- **Risk:** None

### Option B: Change input type to `text` and add custom validation
```tsx
type="text"
placeholder="yourname.substack.com"
```
Then add a `pattern` attribute or manual validation in `handleGenerate` to prepend `https://` if missing.
- **Pros:** More forgiving for users who type bare hostnames
- **Cons:** Loses built-in URL validation; more code required
- **Effort:** Small-Medium
- **Risk:** Low — need to ensure any manually constructed URL still passes `normalizeSubstackUrl`

## Recommended Action

Option A. The placeholder fix is trivial and consistent with how every example URL is formatted.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:331` — placeholder attribute

## Acceptance Criteria

- [ ] Typing `yourname.substack.com` and clicking submit either works or shows a helpful app-level error (not a raw browser validation error)
- [ ] The placeholder text matches the format required by `type="url"`
- [ ] Existing valid URL entry (`https://example.substack.com`) continues to work

## Work Log

- 2026-03-28: Finding created from PR #3 code review (feat/ui-redesign-centered-layout)

## Resources

- PR #3: feat(ui): redesign homepage with centered card layout
- TypeScript reviewer finding: "P2 — type="url" input does not accept bare hostnames without a protocol"
- Security sentinel finding: "Placeholder mismatch with type="url""
