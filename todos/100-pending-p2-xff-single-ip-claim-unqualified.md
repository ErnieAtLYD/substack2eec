---
status: pending
priority: p2
issue_id: "100"
tags: [code-review, security, middleware, rate-limiting, vercel]
dependencies: ["084"]
---

# `x-vercel-forwarded-for` Single-IP Claim Is Unqualified

## Problem Statement

`docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md` states as a definitive fact that Vercel sets `x-vercel-forwarded-for` as a single IP (lines 81 and 89), using this as justification for omitting `.split(',')[0].trim()` in the fix. Vercel's documentation does not formally guarantee this in all forwarding scenarios (e.g. behind a corporate proxy that Vercel recognises at its ingress). If the header ever contains a comma-separated list, the middleware uses the full string as the rate-limit key, opening a fresh bucket per request — functionally identical to the original XFF vulnerability.

## Findings

**Affected locations:**
- `src/middleware.ts:43` — `request.headers.get('x-vercel-forwarded-for')` used raw without splitting
- `docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md:81` — "Vercel sets this as a single IP — splitting is redundant"
- `docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md:89` — repeats the same claim

**Risk:** If the claim is wrong in edge forwarding scenarios, the fix silently regresses to a new form of the original vulnerability (composite key = fresh bucket per unique header value).

## Proposed Solutions

### Option A — Add defensive split (Recommended)

```typescript
// src/middleware.ts
const ip =
  (request as NextRequest & { ip?: string }).ip ??
  request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown'
```

Update the doc to remove the "splitting is redundant" claim and instead say: "Vercel sets this as a single IP in standard deployments; the split is a safety belt."

- **Pros:** Correct regardless of Vercel's exact forwarding behavior; no functional change for single-IP case
- **Cons:** Tiny added verbosity
- **Effort:** Small | **Risk:** None

### Option B — Qualify the claim in the doc only

Leave the code as-is, but change the doc to: "In practice Vercel sets a single IP value here, but `.split(',')[0].trim()` can be added defensively if that assumption ever changes."

- **Pros:** No code change
- **Cons:** Leaves the code fragile if the assumption is wrong in some environments
- **Effort:** Tiny | **Risk:** Low

## Recommended Action

Option A. The split costs nothing and makes the behavior resilient. The doc should reflect what the code actually does.

## Technical Details

**Affected files:**
- `src/middleware.ts`
- `docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md`

## Acceptance Criteria

- [ ] `src/middleware.ts` applies `.split(',')[0].trim()` to `x-vercel-forwarded-for` (or doc is updated to qualify the single-IP claim with explicit acknowledgement of the assumption)
- [ ] The "Key decisions" block in the solution doc is updated to match whatever the code does

## Work Log

- 2026-04-12: Found by security-sentinel review of PR #7
