---
status: pending
priority: p2
issue_id: "102"
tags: [code-review, documentation, typescript]
dependencies: []
---

# Solution Doc Has Inaccurate Code Snippets

## Problem Statement

`docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md` contains three code snippet errors that will mislead readers who copy the patterns:

1. `beforeEach` type cast uses `Response` instead of `NextResponse`
2. The "Test Pattern: Proving Non-Spoofability" section uses `await` on the middleware function, which is synchronous
3. The `getClientIp` safe-pattern helper omits the `request.ip` type cast required in Next.js 16

These are copy-paste traps in a document explicitly designed to be copied.

## Findings

**Error 1 — Wrong return type in test helper (line 125)**
```typescript
// DOC SAYS:
middlewareFn = mod.middleware as (req: NextRequest) => Response
// SHOULD BE:
middlewareFn = mod.middleware as (req: NextRequest) => NextResponse
```
`NextResponse` extends `Response`; the cast doesn't fail at runtime but callers accessing `NextResponse`-specific properties would get type errors.

**Error 2 — `await` on a synchronous function (lines 176-188)**
```typescript
// DOC SAYS (Test Pattern section):
const res = await handler(makeRequest({ ... }))
// SHOULD BE:
const res = handler(makeRequest({ ... }))
```
`middleware` is synchronous. `await` on a non-Promise works at runtime but misrepresents the function's signature and is inconsistent with the "Bug-reproduction tests" block earlier in the same doc (lines 103-116) which calls `middlewareFn(req).status` synchronously.

**Error 3 — `getClientIp` helper missing type cast (lines 138-145)**
```typescript
// DOC SAYS (will not compile in strict TS with Next.js 16):
function getClientIp(request: NextRequest): string {
  return (
    request.ip ??  // ← Property 'ip' does not exist on type 'NextRequest'
    ...
  )
}
// SHOULD BE:
function getClientIp(request: NextRequest): string {
  return (
    (request as NextRequest & { ip?: string }).ip ??
    ...
  )
}
```

## Proposed Solutions

### Option A — Fix all three in-place (Recommended)

1. Change `Response` → `NextResponse` in the `beforeEach` cast
2. Remove `await` from the "Test Pattern" section
3. Add the `as NextRequest & { ip?: string }` cast to the `getClientIp` helper

- **Effort:** Small | **Risk:** None

### Option B — Remove the duplicated Test Pattern section entirely

The "Test Pattern" section (lines 170-189) is already flagged as a duplicate of the concrete test (see todo 103). Removing it also removes error 2. Errors 1 and 3 still need fixing.

- **Effort:** Small | **Risk:** None

## Recommended Action

Option A.

## Technical Details

**Affected file:** `docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md`  
Lines: 125, 138-145, 176-188

## Acceptance Criteria

- [ ] `beforeEach` type annotation uses `NextResponse` not `Response`
- [ ] `await` removed from Test Pattern section (or section removed)
- [ ] `getClientIp` helper includes the `as NextRequest & { ip?: string }` cast

## Work Log

- 2026-04-12: Found by kieran-typescript-reviewer on PR #7
