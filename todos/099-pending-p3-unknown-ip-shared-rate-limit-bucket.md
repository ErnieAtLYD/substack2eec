---
status: pending
priority: p3
issue_id: "099"
tags: [code-review, security, rate-limiting, middleware]
dependencies: ["046"]
---

# Rate Limiter `unknown` Fallback Creates Shared DoS Bucket

## Problem Statement

When IP resolution fails (e.g., health checks, loopback traffic, missing headers), the middleware falls back to the key `unknown:${pathname}`. All clients with unresolvable IPs share this single rate-limit bucket. Five distinct legitimate users with unresolvable IPs hitting `/api/curate` simultaneously would exhaust the shared bucket and lock out each other.

This is a denial-of-service amplification against legitimate users, not an attacker bypass.

## Findings

**Location:** `src/middleware.ts:44`

```typescript
const key = `${ip}:${pathname}`
// ip = 'unknown' when request.ip and x-vercel-forwarded-for are both absent
```

**Scenario:** On Vercel, internal health checks and loopback requests may not carry `request.ip` or `x-vercel-forwarded-for`. Multiple such requests share the `unknown:/api/curate` bucket and can reach the 5 req/min limit before any real user request is keyed there — but more likely, 5 distinct real users with unresolvable IPs block each other.

**Severity:** P3 (nice-to-have) — on Vercel, `request.ip` is populated for nearly all real client requests, making the `unknown` path rare in production.

## Proposed Solutions

### Option A — Reject requests with unresolvable IP (Recommended)
```typescript
if (!ip || ip === 'unknown') {
  return new NextResponse('Bad Request', { status: 400 })
}
```
Explicitly rejects requests where IP cannot be determined. Prevents the shared-bucket problem entirely. Health checks that don't carry an IP should not be rate-limited via this path.

- **Pros:** Eliminates the shared bucket; forces callers to use proper headers
- **Cons:** May break internal health checks that genuinely have no IP
- **Effort:** Small | **Risk:** Low

### Option B — Skip rate limiting for `unknown` IPs
```typescript
if (!ip || ip === 'unknown') return NextResponse.next()
```
Don't rate-limit when IP is unknown. Prevents the shared bucket and doesn't block anything. Leaves a small bypass window for clients that can engineer no-IP scenarios.

- **Pros:** No false-positive blocking; simple
- **Cons:** Any client that suppresses IP resolution bypasses rate limits entirely
- **Effort:** Tiny | **Risk:** Low-Medium

### Option C — Log and monitor `unknown` usage, no code change
Add a log line when `ip === 'unknown'` to track frequency. If it's effectively zero in production, close as won't-fix.

- **Pros:** No risk, informs decision
- **Cons:** Doesn't fix the shared-bucket risk
- **Effort:** Tiny | **Risk:** None

## Recommended Action

Option C first (monitor in production); promote to Option A if `unknown` keys appear in logs.

## Technical Details

**Affected file:** `src/middleware.ts:44`

## Acceptance Criteria

- [ ] `unknown` IP no longer creates a shared rate-limit bucket that blocks distinct users, OR
- [ ] Confirmed via monitoring that `unknown` IP path is never hit in production (won't-fix)

## Work Log

- 2026-04-12: Found during plan review of `docs/plans/2026-04-12-fix-middleware-xff-ip-spoofing-plan.md` (security sentinel analysis)
