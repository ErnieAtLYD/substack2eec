---
status: complete
priority: p1
issue_id: "022"
tags: [code-review, quality, ux]
dependencies: []
---

# Example Buttons Always Fail — URLs Are Not `.substack.com` Domains

## Problem Statement

The three "Try an example" buttons added in PR #3 are completely non-functional. All three hardcoded URLs (`lennysnewsletter.com`, `generalist.com`, `notboring.co`) are not `.substack.com` domains. The server's `normalizeSubstackUrl` validates `hostname.endsWith('.substack.com')` before making any request, so clicking any example always results in the error "URL must be a substack.com publication."

**Why it matters:** A new feature was shipped broken by default. Every user who tries the "Try an example" shortcut will see an error on their very first interaction.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:274–278`

```tsx
const examples = [
  { label: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com' },
  { label: 'The Generalist',     url: 'https://www.generalist.com' },
  { label: 'Not Boring',         url: 'https://www.notboring.co' },
]
```

- `lennysnewsletter.com` hosts Lenny Rachitsky's newsletter but it **also** has a Substack: `lenny.substack.com`
- `notboring.co` has a Substack: `notboring.substack.com`
- `www.generalist.com` — the Generalist publishes on Substack at `generalist.substack.com`

All three have corresponding `.substack.com` URLs that would work correctly.

**Server validation:** `src/lib/substack.ts` — `normalizeSubstackUrl` checks `url.hostname.endsWith('.substack.com')` and throws before any outbound fetch. The error message ("URL must be a substack.com publication") leaks this implementation detail.

## Proposed Solutions

### Option A: Replace with actual Substack URLs (Recommended)
```tsx
const EXAMPLES = [
  { label: "Lenny's Newsletter", url: 'https://lenny.substack.com' },
  { label: 'The Generalist',     url: 'https://generalist.substack.com' },
  { label: 'Not Boring',         url: 'https://notboring.substack.com' },
] as const
```
- **Pros:** One-line fix per entry, feature works immediately
- **Cons:** Need to verify these Substack URLs are still active
- **Effort:** Small
- **Risk:** None

### Option B: Remove examples entirely until verified
Remove the examples section from the card until valid URLs are confirmed.
- **Pros:** No broken feature visible to users
- **Cons:** Loses the UX affordance of examples
- **Effort:** Small
- **Risk:** None

## Recommended Action

Option A — replace with verified `.substack.com` URLs. Also combine with todo 018 (moving `examples` to module scope) in the same fix.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:274–278` — hardcoded example URLs

**Server validation:**
- `src/lib/substack.ts` — `normalizeSubstackUrl` enforces `.substack.com` hostname

## Acceptance Criteria

- [ ] All example buttons populate the URL input with a `.substack.com` URL
- [ ] Clicking an example button and submitting the form successfully reaches the fetching state
- [ ] No "URL must be a substack.com publication" error appears after clicking an example

## Work Log

- 2026-03-28: Finding created from PR #3 code review (feat/ui-redesign-centered-layout)

## Resources

- PR #3: feat(ui): redesign homepage with centered card layout
- Security sentinel finding: "Example URLs are not Substack domains"
- Learnings researcher: related to `docs/solutions/security-issues/ssrf-unrestricted-url-normalization.md`
