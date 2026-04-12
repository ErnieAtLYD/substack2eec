---
status: pending
priority: p2
issue_id: "084"
tags: [code-review, security, rate-limiting, middleware]
dependencies: []
---

# Rate-Limit Bypass via `x-forwarded-for` Spoofing — Worsened by New Endpoint

## Problem Statement

The in-memory rate limiter reads IP from attacker-controlled headers:

```ts
const ip =
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  request.headers.get('x-real-ip') ??
  'unknown'
// src/middleware.ts:39–43
```

`x-forwarded-for` is fully attacker-controlled unless set by a trusted proxy. Any client can send `X-Forwarded-For: 1.2.3.4` to rotate IPs and bypass all per-IP limits.

This is an existing weakness, but it is now more consequential: `/api/propose-courses` has the tightest limit (3 req/min) and the largest token budget (`max_tokens: 8192`). Unlimited calls would directly drain the Anthropic API budget.

## Findings

- `src/middleware.ts:39–43` — IP from untrusted headers
- `/api/propose-courses` rate: 3 req/min (tightest in app)
- `proposeCourseCandidates`: single call with `max_tokens: 8192` — highest output token budget

**Source:** Security sentinel review

## Proposed Solutions

### Option A — Use Vercel's trusted IP (Recommended for Vercel deployment)
On Vercel, `request.ip` contains the verified IP set by the edge network:
```ts
const ip = request.ip ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
```
This eliminates spoofing on Vercel without any extra infrastructure.

**Effort:** Small | **Risk:** Low

### Option B — Add a global circuit breaker (backstop)
Regardless of per-IP limits, add a global counter: if total requests to propose-courses exceed N/minute, reject all requests temporarily. This limits blast radius from IP rotation attacks.

**Effort:** Medium | **Risk:** Low

### Option C — Add API key auth to the propose-courses endpoint
Require a shared secret header for the propose-courses call (only the UI sends it). Not practical for a public-facing app without proper auth infrastructure.

**Effort:** Large | **Risk:** Medium

## Recommended Action

Option A if deployed to Vercel (likely, given the `maxDuration` settings). Option B as an additional backstop.

## Technical Details

**Affected files:**
- `src/middleware.ts:39–43`

## Acceptance Criteria

- [ ] Rate-limit IP source is not fully attacker-controllable
- [ ] OR: global circuit breaker added as backstop for propose-courses

## Work Log

- 2026-04-04: Found by security sentinel code review (existing issue, worsened by new endpoint)
