---
title: "fix: Rate Limiter Uses Attacker-Controlled IP from X-Forwarded-For"
type: fix
status: completed
date: 2026-04-12
---

# fix: Rate Limiter Uses Attacker-Controlled IP from X-Forwarded-For

🐛 The middleware rate limiter keys on the **leftmost** `X-Forwarded-For` entry, which is set by the client. Any caller can send `X-Forwarded-For: 1.2.3.4` to make the rate limiter key on an arbitrary value, trivially bypassing the 5 req/min limit on `/api/curate` and enabling Claude API cost amplification attacks.

## Problem Statement

**Location:** `src/middleware.ts:39-43`

```typescript
const ip =
  (request as NextRequest & { ip?: string }).ip ??
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown'
```

`split(',')[0]` is the leftmost entry, which is **appended by the original client**. A client rotating `X-Forwarded-For` on every request makes the rate limiter completely ineffective. The `request.ip` path is correct but the fallback is not.

On Vercel, `request.ip` is injected by the platform at the edge and is non-spoofable. It is the primary source. `x-vercel-forwarded-for` is the secondary Vercel-controlled header, also non-spoofable and also a single IP (no comma-separated chain). Research confirms Vercel overwrites this header at ingress — clients cannot pre-inject a value.

## Proposed Fix

Replace the leftmost-XFF fallback with `x-vercel-forwarded-for` (Vercel's authoritative trusted header):

```typescript
// src/middleware.ts:39-43
const ip =
  (request as NextRequest & { ip?: string }).ip ??
  request.headers.get('x-vercel-forwarded-for') ??
  'unknown'
```

**Why not rightmost XFF as fallback:** The app is Vercel-only (`maxDuration` exports confirm Vercel deployment target). In non-Vercel environments where `x-vercel-forwarded-for` is absent, `X-Forwarded-For` is also untrustworthy regardless of which end is taken (no guaranteed trusted outermost proxy). Adding the rightmost-XFF fallback would be YAGNI and give a false sense of security for an unsupported deployment target.

**`x-real-ip` considered and excluded:** Some proxy setups use this header, but Vercel does not set it — it is absent in all Vercel deployments. Adding it would be dead code.

## Acceptance Criteria

- [x] Write a failing test in `src/__tests__/middleware.test.ts` that demonstrates the spoof: a request with a spoofed `X-Forwarded-For` header uses the same rate-limit bucket as the real IP (i.e., spoofing does not create a new bucket)
- [x] Rate limiter uses `x-vercel-forwarded-for` as the IP key when `request.ip` is absent, not leftmost XFF
- [x] Test passes after the fix is applied
- [x] Sending `X-Forwarded-For: 1.2.3.4` with a real IP via `x-vercel-forwarded-for` does not bypass the rate limit

## Implementation Order

Per project rules, write the bug-reproducing test **before** touching `src/middleware.ts`.

1. **Write failing test** — `src/__tests__/middleware.test.ts`
   - Mock `NextRequest` with a spoofed `X-Forwarded-For: 255.255.255.255` header and a real `x-vercel-forwarded-for: 1.2.3.4`
   - Assert the rate-limit key uses `1.2.3.4`, not `255.255.255.255`
   - Assert spoofing doesn't open a new bucket (i.e., 6 requests with different XFF values are still rate-limited after 5)
   - **Critical:** call `store.clear()` (or re-import the module) between test cases — the in-memory `store` is module-level state and Jest does not reset it automatically. Without teardown, bucket-accumulation assertions will produce false positives.

2. **Apply fix** — `src/middleware.ts:39-43`
   - Replace the two-line XFF fallback with `x-vercel-forwarded-for` only

3. **Confirm test passes**

## Context

- **Affected routes:** all rate-limited routes (`/api/curate`, `/api/fetch-posts`, `/api/export`, `/api/propose-courses`)
- **Highest risk:** `/api/curate` (limit: 5/min) — directly gates Claude API calls
- **Deployment:** Vercel — `request.ip` is always populated for real client requests; `x-vercel-forwarded-for` covers the rare edge case where `request.ip` is absent (health checks, loopback)
- **Known separate concern:** When IP cannot be resolved, all requests fall into the `unknown:${pathname}` bucket. Multiple distinct clients with unresolvable IPs can exhaust each other's quota (see `todos/099-pending-p3-unknown-ip-shared-rate-limit-bucket.md`)

## Sources & References

- Bug report: `todos/046-pending-p2-middleware-xff-ip-spoofing.md`
- Related prior finding: `todos/084-complete-p2-rate-limit-ip-spoofing-bypassable.md`
- Vulnerable code: `src/middleware.ts:39-43`
- Research confirmed: `x-vercel-forwarded-for` is non-spoofable (Vercel overwrites at ingress, single IP value); `request.ip` is the primary trusted source on Vercel
