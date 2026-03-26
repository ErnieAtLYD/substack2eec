---
title: SSRF Vulnerability in URL Normalization
problem_type: security_issue
component: src/lib/substack.ts
symptoms:
  - Server makes outbound fetch to any hostname supplied by the user
  - Attacker can target internal endpoints (AWS metadata, internal services)
  - No error or rejection for non-Substack domains
tags:
  - server-side request forgery
  - input validation
  - hostname allowlist
severity: critical
---

# SSRF Vulnerability in URL Normalization

## Problem

`normalizeSubstackUrl()` extracted the hostname from any user-supplied URL and returned it directly for use in outbound fetches. The only guard was `hostname.includes('.')`, which any domain satisfies. An attacker could POST `https://169.254.169.254/` or any internal hostname to `/api/fetch-posts` and the server would faithfully request it.

## Root Cause

The hostname was treated as valid after only a format check (contains a dot), not a domain check. It was then interpolated directly into `fetch` calls:

```typescript
// src/lib/substack.ts
`https://${pub}/api/v1/archive?...`
`https://${pub}/api/v1/posts/${slug}`
```

## Before

```typescript
export function normalizeSubstackUrl(raw: string): string {
  try {
    const url = new URL(raw.trim())
    if (!url.hostname.includes('.')) throw new Error('Invalid hostname')
    return url.hostname
  } catch {
    throw new Error(`Invalid Substack URL: "${raw}"`)
  }
}
```

## After

```typescript
export function normalizeSubstackUrl(raw: string): string {
  try {
    const url = new URL(raw.trim())
    if (!url.hostname.endsWith('.substack.com')) {
      throw new Error('URL must be a substack.com publication')
    }
    return url.hostname
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : `Invalid Substack URL: "${raw}"`)
  }
}
```

## Prevention

Whenever a server accepts a user-supplied URL and makes an outbound request with it, enforce an allowlist at the hostname level — not just a format check.

**Detection grep:**
```bash
# Find places where user-supplied URLs become outbound fetches
grep -n "new URL(" src/ -r --include="*.ts"
grep -n 'https://${' src/ -r --include="*.ts"
```

**Rules:**
- Use `.endsWith('.expected-domain.com')` not `.includes('.')`
- Validate at the point of normalization, before any fetch
- Keep the error message informative so users know the constraint

## Related

- `docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md` — similar allowlist pattern for numeric parameters
