---
title: Rate-limit bypass via spoofable X-Forwarded-For header in middleware
problem_type: security_issue
component: middleware
tags:
  - security
  - rate-limiting
  - ip-spoofing
  - vercel
symptoms:
  - Rate limiter keyed on client-controlled X-Forwarded-For header
  - Callers can rotate XFF header on every request to get a fresh rate-limit bucket
  - Per-IP rate limit on /api/curate (or any route) is bypassable
  - Unbounded upstream API spend amplification
affected_files:
  - src/middleware.ts
pr: https://github.com/ErnieAtLYD/substack2eec/pull/7
date: 2026-04-12
---

# Rate-limit bypass via spoofable X-Forwarded-For header in middleware

## Problem

The rate limiter in `src/middleware.ts` used the leftmost `X-Forwarded-For` entry as the rate-limit key:

```typescript
// VULNERABLE
const ip =
  (request as NextRequest & { ip?: string }).ip ??
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown'
```

`split(',')[0]` is the **leftmost** entry in the XFF chain — the value that the original client sent. Any caller could rotate this value on every request:

```
GET /api/curate
X-Forwarded-For: 1.0.0.1   → fresh bucket, 0/5 consumed → 200
X-Forwarded-For: 1.0.0.2   → fresh bucket, 0/5 consumed → 200
X-Forwarded-For: 1.0.0.3   → fresh bucket, 0/5 consumed → 200
... (unlimited requests at full speed)
```

This rendered the 5 req/min guard on `/api/curate` completely ineffective and enabled unbounded Anthropic Claude API spend amplification.

## Root Cause

`X-Forwarded-For` follows the standard proxy-append convention: each proxy in the chain **appends** the connecting IP. The leftmost entry is what the client originally sent — not what the infrastructure set. This makes it trivially forgeable.

**Header trust hierarchy on Vercel:**

| Header | Controlled by | Safe for rate limiting? |
|--------|--------------|------------------------|
| `request.ip` | Vercel edge (injected) | ✅ Yes — primary source |
| `x-vercel-forwarded-for` | Vercel edge (overwritten at ingress) | ✅ Yes — secondary source |
| `x-forwarded-for` leftmost | Client | ❌ Never |
| `x-forwarded-for` rightmost | Last infrastructure proxy | ⚠️ Situational |
| `x-real-ip` | Not set by Vercel | ❌ Dead code on Vercel |

## Fix

Replace the spoofable leftmost-XFF fallback with `x-vercel-forwarded-for`:

```typescript
// src/middleware.ts
const ip =
  // request.ip is injected by Vercel's edge and is non-spoofable
  (request as NextRequest & { ip?: string }).ip ??
  // x-vercel-forwarded-for is set by Vercel at ingress and cannot be spoofed by clients;
  // split defensively in case Vercel ever emits a comma-separated list in forwarding scenarios
  request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
  // TODO: todos/099 — 'unknown' is a shared bucket; consider rejecting instead of silently accepting
  'unknown'
```

**Key decisions:**

- **Defensive `.split(',')[0]?.trim()` on `x-vercel-forwarded-for`:** In practice Vercel sets a single IP value here, but the split costs nothing and keeps the code resilient if that assumption ever changes in forwarding scenarios.
- **No rightmost-XFF fallback (YAGNI):** This app is Vercel-only. In non-Vercel environments, XFF at any position is untrustworthy without knowing the proxy chain depth.
- **`x-real-ip` excluded:** Vercel does not set this header — it would always be null.

## Tests (`src/__tests__/middleware.test.ts`)

Uses `vi.resetModules()` + dynamic import in `beforeEach` to give each test a clean in-memory `store` Map.

**Bug-reproduction tests (failed before fix, pass after):**

```typescript
it('rotating X-Forwarded-For does NOT open a new bucket when x-vercel-forwarded-for is present', async () => {
  const realIp = '1.2.3.4'
  // exhaust the limit using the real IP, rotating XFF each time
  for (let i = 0; i < CURATE_LIMIT; i++) {
    const req = makeRequest('/api/curate', {
      'x-vercel-forwarded-for': realIp,
      'x-forwarded-for': `10.0.0.${i}`,
    })
    expect(middlewareFn(req).status).not.toBe(429)
  }
  // 6th request with yet another spoofed XFF must still be rate-limited
  const bypassAttempt = makeRequest('/api/curate', {
    'x-vercel-forwarded-for': realIp,
    'x-forwarded-for': '10.0.0.99',
  })
  expect(middlewareFn(bypassAttempt).status).toBe(429)
})
```

**Critical detail:** Use `vi.resetModules()` + dynamic import — the in-memory `store` is module-level state and Jest/Vitest won't reset it automatically between tests. Without this, tests share state and produce false positives.

```typescript
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('../middleware')
  middlewareFn = mod.middleware as (req: NextRequest) => NextResponse
})
```

## Prevention & Best Practices

### The Rule

**Never key a rate limiter on a client-controlled header.**

**Safe pattern for Vercel:**

```typescript
const ip =
  (request as NextRequest & { ip?: string }).ip ??
  request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown'
```

Do not fall back to `X-Forwarded-For` in this chain. If neither trusted source is available, the origin is unverifiable — consider rejecting rather than silently accepting under `'unknown'` (the `unknown` bucket is itself a shared DoS vector; see `todos/099`).

### Red Flags in Code Review

```typescript
// UNSAFE — leftmost entry is client-controlled
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()

// UNSAFE — same problem, different form
const ip = req.headers['x-forwarded-for']?.split(',').shift()

// UNSAFE — X-Real-IP is not set by Vercel and is spoofable on other platforms
const ip = request.headers.get('x-real-ip')

// UNSAFE — full XFF value used as key; under proxy chaining every unique multi-IP
//           string becomes its own bucket, effectively disabling the rate limit
const ip = request.headers.get('x-forwarded-for')
```

### Review Checklist

- [ ] Rate-limit key uses `request.ip` or `x-vercel-forwarded-for`, not `X-Forwarded-For`
- [ ] Fallback chain contains no spoofable headers — if `request.ip` is null, the fallback must also be platform-controlled
- [ ] `'unknown'` origin is handled explicitly (reject or flag, not silently accept)
- [ ] Test suite includes a spoofing test: rotates `X-Forwarded-For` while holding the trusted IP constant and asserts the rate limit is not bypassed
- [ ] A comment at the IP-extraction call site documents which platform the trusted-header assumption relies on

## Related Documentation

- **Plan:** `docs/plans/2026-04-12-fix-middleware-xff-ip-spoofing-plan.md` — documents the decision rationale (no rightmost-XFF, no `x-real-ip`)
- **PR:** [ErnieAtLYD/substack2eec#7](https://github.com/ErnieAtLYD/substack2eec/pull/7)
- **Todos closed:** `todos/046-complete-p2-middleware-xff-ip-spoofing.md`, `todos/084-complete-p2-rate-limit-ip-spoofing-bypassable.md`
- **Open related:** `todos/050` (unbounded Map growth), `todos/099` (`unknown` shared bucket DoS risk)
- **Earlier rate-limit work:** [ErnieAtLYD/substack2eec#3](https://github.com/ErnieAtLYD/substack2eec/pull/3) — initial rate limiting via `todos/014`
