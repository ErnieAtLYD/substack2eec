---
status: done
priority: p3
issue_id: "019"
tags: [code-review, security, hardening]
dependencies: []
---

# No HTTP Security Headers Configured in `next.config.ts`

## Problem Statement

`next.config.ts` is empty — no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` headers are set. This is baseline hardening that is missing from the entire application.

**Why it matters:** Without `X-Frame-Options: DENY`, the app can be clickjacked. Without `CSP`, any injected script (e.g., from AI-generated content rendered unsafely) runs freely. Low exploitability individually but collectively represents unmet baseline hygiene.

## Findings

**Location:** `next.config.ts` — empty config object

## Proposed Solutions

### Option A — Add `headers()` to `next.config.ts` (Recommended)

```typescript
const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
}
```

CSP requires careful tuning for Next.js inline scripts — address separately.

- **Pros:** Immediate hardening improvement, no functionality impact
- **Cons:** CSP needs tuning for Next.js script injection
- **Effort:** Small | **Risk:** Low (non-CSP headers are safe to add immediately)

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `next.config.ts`

## Acceptance Criteria

- [ ] `X-Frame-Options: DENY` header present on all responses
- [ ] `X-Content-Type-Options: nosniff` header present
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` header present

## Work Log

- 2026-03-27: Surfaced by security-sentinel agent during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
