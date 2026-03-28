---
status: pending
priority: p3
issue_id: "030"
tags: [code-review, ux, error-messages]
dependencies: []
---

# SSRF Protocol Allowlist Error Message Says "https://" But `http:` Is Also Accepted

## Problem Statement

The error message thrown when a URL has a disallowed protocol says `"URL must use https://"`, but the `ALLOWED_PROTOCOLS` set includes both `'https:'` and `'http:'`. The message is factually incorrect — `http://foo.substack.com` is accepted and would not trigger this error, so telling the user to "use https://" is misleading for the cases where the error actually fires (`ftp://`, `file://`, `javascript:`, etc.).

## Findings

**Location:** `src/lib/substack.ts:11–18`

```typescript
const ALLOWED_PROTOCOLS = new Set(['https:', 'http:'])  // http: is allowed

if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
  throw new Error('URL must use https://')  // ← "https://" but http: IS accepted
}
```

**Two ways to fix:**
1. Make the message accurate: `"URL must start with http:// or https://"`
2. Tighten the allowlist to `https:`-only, making the message accurate

Option 2 is preferable from a security standpoint — `http:` Substack URLs are transparently normalized downstream (all fetch calls use `https://`), but accepting cleartext HTTP input is slightly sloppy.

## Proposed Solutions

### Option A: Update error message to match the actual allowlist (Minimal change)
```typescript
throw new Error('URL must start with http:// or https://')
```
- **Pros:** Accurate, minimal change, preserves `http:` acceptance for user convenience
- **Cons:** Slightly less clean guidance (most users should use https://)
- **Effort:** Trivial

### Option B: Remove `http:` from allowlist (Tighter security, cleaner message) — Recommended
```typescript
const ALLOWED_PROTOCOLS = new Set(['https:'])

if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
  throw new Error('URL must use https://')
}
```
- **Pros:** Message is accurate; SSRF fix is tighter; users who paste `http://` URLs are told to use https://
- **Cons:** `http://` Substack URLs now require the user to add `s` — minor UX friction
- **Note:** Downstream fetch calls already use `https://` regardless, so accepting `http:` was a convenience, not a requirement
- **Effort:** Trivial

## Recommended Action

Option B — remove `http:` from `ALLOWED_PROTOCOLS`. Substack is HTTPS-only; there is no legitimate reason to accept `http://` URLs. The "user convenience" argument is weak when the fix is adding one character.

## Technical Details

**Affected files:**
- `src/lib/substack.ts:11–18`

## Acceptance Criteria

- [ ] `http://foo.substack.com` either: (A) is accepted with an updated accurate error message, or (B) is rejected with "URL must use https://"
- [ ] `https://foo.substack.com` continues to be accepted
- [ ] `ftp://foo.substack.com` is rejected with a clear, accurate error message
- [ ] The error message matches what is actually allowed

## Work Log

- 2026-03-28: Finding from PR #3 TypeScript review and security review

## Resources

- PR #3: `feat/ui-redesign-centered-layout`
- `src/lib/substack.ts` — `normalizeSubstackUrl`
