---
status: complete
priority: p2
issue_id: "046"
tags: [code-review, security, rate-limiting]
dependencies: []
---

# Middleware Rate Limiter Uses Leftmost (Attacker-Controlled) IP from `X-Forwarded-For`

## Problem Statement

The rate limiter keys on `x-forwarded-for.split(',')[0]` — the leftmost entry, which is *set by the client*. Any caller can send `X-Forwarded-For: 1.2.3.4` to make the rate limiter key on an arbitrary value, bypassing the 5 req/min limit on `/api/curate`. This trivially bypasses the protection against Claude API cost amplification.

## Findings

**Location:** `src/middleware.ts:38-42`

```typescript
const ip =
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  request.headers.get('x-real-ip') ??
  'unknown'
```

`split(',')[0]` is the leftmost entry, which is appended by the *original client*. A client sending `X-Forwarded-For: 255.255.255.255` causes the rate limiter to use `255.255.255.255` as the key. Rotating this value on every request makes the rate limiter ineffective.

On Vercel, the platform appends the real client IP to the right of the chain. The canonical header is `x-vercel-forwarded-for`.

## Proposed Solutions

### Option A: Use `x-vercel-forwarded-for` (Recommended for Vercel)
```typescript
const ip =
  request.headers.get('x-vercel-forwarded-for') ??
  request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
  'unknown'
```
`x-vercel-forwarded-for` is populated by Vercel's infrastructure and cannot be spoofed by clients. The `at(-1)` fallback uses the rightmost (infrastructure-appended) IP for self-hosted deployments.

- **Pros:** Correct for Vercel; non-spoofable
- **Effort:** Tiny
- **Risk:** None (Vercel populates this header for all requests)

### Option B: Add a comment documenting the limitation
If fixing the header is deferred, at minimum add a comment:
```typescript
// WARNING: x-forwarded-for leftmost entry is client-controlled.
// On Vercel, use x-vercel-forwarded-for for non-spoofable IP.
// This rate limiter can be bypassed by rotating the XFF header.
```
- **Pros:** Honest about the limitation
- **Cons:** Doesn't fix the problem

## Recommended Action

Option A. One-line change; Vercel provides the correct header.

## Technical Details

**Affected file:** `src/middleware.ts:38-42`

## Acceptance Criteria

- [ ] Rate limiter uses `x-vercel-forwarded-for` (or rightmost XFF entry) as the IP key
- [ ] Spoofing `X-Forwarded-For` header does not change which bucket the request falls into

## Work Log

- 2026-03-29: Found during security review of batch fixes (round 2)
