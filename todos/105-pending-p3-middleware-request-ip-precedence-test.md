---
status: pending
priority: p3
issue_id: "105"
tags: [code-review, testing, middleware, rate-limiting]
dependencies: ["084"]
---

# Missing Test: `request.ip` Takes Precedence Over `x-vercel-forwarded-for`

## Problem Statement

`src/__tests__/middleware.test.ts` has no test confirming that `request.ip` is used as the rate-limit key when present, and that `x-vercel-forwarded-for` is correctly ignored in that case. If someone later swaps the precedence order in the `??` chain, no test fails.

## Findings

**Current coverage:**
- ✅ Rotating `X-Forwarded-For` with fixed `x-vercel-forwarded-for` does NOT open new buckets
- ✅ 5 requests from same IP are allowed, 6th is blocked
- ✅ Different IP addresses get separate buckets
- ❌ No test for `request.ip` being the primary key when both `request.ip` and `x-vercel-forwarded-for` are present

**The gap:** The `??` chain at `src/middleware.ts:39-44` relies on `request.ip` having priority. The existing tests only exercise the `x-vercel-forwarded-for` branch.

**Implementation note:** `NextRequest` in Vitest/jsdom does not expose `request.ip` as a settable property via the standard `Request` constructor. Implementing this test requires either:
- Casting a mock object to `NextRequest & { ip?: string }` in `makeRequest`
- Using `Object.defineProperty` to set `.ip` on the constructed request

## Proposed Solutions

### Option A — Extend `makeRequest` to accept a simulated `ip` param

```typescript
function makeRequest(
  pathname: string,
  headers: Record<string, string> = {},
  ip?: string
): NextRequest {
  const req = new NextRequest(`http://localhost${pathname}`, { headers })
  if (ip) Object.defineProperty(req, 'ip', { value: ip, configurable: true })
  return req
}

it('keys on request.ip when present, ignoring x-vercel-forwarded-for', async () => {
  const primaryIp = '7.7.7.7'
  const headerIp  = '8.8.8.8'  // different from primaryIp
  for (let i = 0; i < CURATE_LIMIT; i++) {
    const req = makeRequest('/api/curate', { 'x-vercel-forwarded-for': headerIp }, primaryIp)
    expect(middlewareFn(req).status).not.toBe(429)
  }
  // 6th request with same request.ip should be rate-limited even with fresh x-vercel-forwarded-for
  const req = makeRequest('/api/curate', { 'x-vercel-forwarded-for': '9.9.9.9' }, primaryIp)
  expect(middlewareFn(req).status).toBe(429)
})
```

- **Pros:** Direct coverage of the priority chain
- **Cons:** Requires `Object.defineProperty` workaround
- **Effort:** Small | **Risk:** Low

### Option B — Document the gap in the test file with a skip

Add a `it.skip` with a comment explaining why the test cannot be written cleanly in the current test setup.

- **Pros:** Transparent about the gap
- **Cons:** Doesn't close the gap
- **Effort:** Tiny | **Risk:** None

## Recommended Action

Option A. The workaround is standard for testing Next.js request properties.

## Technical Details

**Affected file:** `src/__tests__/middleware.test.ts`

## Acceptance Criteria

- [ ] Test exists that confirms `request.ip` is the rate-limit key when present
- [ ] Test confirms a different `x-vercel-forwarded-for` does NOT open a new bucket when `request.ip` matches

## Work Log

- 2026-04-12: Found by security-sentinel on PR #7
