---
status: pending
priority: p2
issue_id: "051"
tags: [code-review, security, headers, csp]
dependencies: []
---

# No `Content-Security-Policy` Header — Future AI-Rendered HTML Would Be Unprotected

## Problem Statement

`next.config.ts` adds 5 security headers but no `Content-Security-Policy`. The current app is safe — React escapes output by default, no `dangerouslySetInnerHTML`, and no third-party scripts. However, the absence of CSP means any future change that renders AI-generated content as HTML would be unprotected by default. CSP is cheap to add now and the app loads no third-party scripts, so a restrictive policy is straightforward.

## Findings

**Location:** `next.config.ts:8-21`

```typescript
headers: [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: '...' },
  // no CSP
],
```

Also: `X-Frame-Options: DENY` is made redundant by `frame-ancestors 'none'` in a CSP, but keeping both maintains compatibility with older browsers.

## Proposed Solutions

### Option A: Add strict CSP (Recommended)
```typescript
{
  key: 'Content-Security-Policy',
  value: [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",  // Tailwind CSS requires this
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
}
```
`'unsafe-inline'` on `style-src` is required for Tailwind CSS (or inline styles). Everything else can be locked down.

### Option B: Add CSP in report-only mode first
```typescript
{ key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; ..." }
```
Logs violations without blocking. Useful for discovering what additional origins Next.js needs.

## Recommended Action

Option A. The app has no third-party scripts or external resources, so a restrictive policy is feasible. Verify that `'unsafe-inline'` is actually required for Tailwind by testing in development.

## Technical Details

**Affected file:** `next.config.ts`

## Acceptance Criteria

- [ ] `Content-Security-Policy` header added to `next.config.ts`
- [ ] Policy blocks inline scripts and external script origins
- [ ] Verified in browser: no CSP violations in normal app usage

## Work Log

- 2026-03-29: Found during security review of batch fixes (round 2)
