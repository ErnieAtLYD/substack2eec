---
title: "Code Review: XFF IP Spoofing Fix — Defensive Split, Test Coverage Gap, and Doc Accuracy"
problem_type: code_review
component: middleware
tags:
  - security
  - rate-limiting
  - testing
  - documentation
symptoms:
  - Solution doc code snippets had wrong return type (Response vs NextResponse), spurious await on sync call, and missing type cast
  - x-vercel-forwarded-for header used raw without .split(',')[0]?.trim() defensive guard, leaving comma-separated value edge case unhandled
  - No test asserted that request.ip takes precedence over x-vercel-forwarded-for in the ?? chain
  - Solution doc contained verbose duplicate sections (Investigation Steps diary, Test Pattern subsection)
  - PR link in solution doc pointed to #6 instead of #7
affected_files:
  - src/middleware.ts
  - src/__tests__/middleware.test.ts
  - docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md
pr: https://github.com/ErnieAtLYD/substack2eec/pull/7
date: 2026-04-13
---

# Code Review: XFF IP Spoofing Fix — Defensive Split, Test Coverage Gap, and Doc Accuracy

## Root Cause

The middleware extracted the client IP using a bare `.get('x-vercel-forwarded-for')` call with no comma-split defense. While Vercel guarantees a single IP in that header today, the absence of a `.split(',')[0]` guard meant a future edge-forwarding scenario (or an unusual routing path) that produces a comma-separated value would silently break rate-limit isolation between clients.

A second gap: the test suite had no coverage for `request.ip` precedence over `x-vercel-forwarded-for`. Because `NextRequest.ip` is not settable via the constructor in Vitest/jsdom, the property had to be injected via `Object.defineProperty` — a non-obvious pattern that was missing entirely. A test that claimed to verify bucket independence between `request.ip` and `x-vercel-forwarded-for` existed but was structurally inert: it would pass even if the `??` priority chain were reversed, so it was removed.

The solution documentation compounded the problem with three copy-paste errors: a `Response` cast where `NextResponse` was required, a spurious `await` on a synchronous function, and a missing `as NextRequest & { ip?: string }` type assertion in the `getClientIp` helper.

## Fix

### 1. Defensive split on `x-vercel-forwarded-for`

```typescript
// src/middleware.ts — before
request.headers.get('x-vercel-forwarded-for') ?? 'unknown'

// after
request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
```

### 2. `request.ip` precedence test via `Object.defineProperty`

`NextRequest.ip` is read-only at the type level and not a constructor option. Use `Object.defineProperty` to inject it in tests:

```typescript
function makeRequest(
  pathname: string,
  headers: Record<string, string> = {},
  ip?: string
): NextRequest {
  const req = new NextRequest(`http://localhost${pathname}`, { headers })
  if (ip !== undefined) {
    Object.defineProperty(req, 'ip', { value: ip, configurable: true })
  }
  return req
}

it('keys on request.ip when present, ignoring x-vercel-forwarded-for', async () => {
  const primaryIp = '7.7.7.7'
  for (let i = 0; i < CURATE_LIMIT; i++) {
    const req = makeRequest(
      '/api/curate',
      { 'x-vercel-forwarded-for': `${i}.${i}.${i}.${i}` },
      primaryIp
    )
    expect(middlewareFn(req).status).not.toBe(429)
  }
  // 6th request: same request.ip, fresh x-vercel-forwarded-for — must still be blocked
  const res = middlewareFn(
    makeRequest('/api/curate', { 'x-vercel-forwarded-for': '8.8.8.8' }, primaryIp)
  )
  expect(res.status).toBe(429)
})
```

### 3. Solution doc code snippet corrections

| Error | Wrong | Correct |
|---|---|---|
| `beforeEach` return type | `(req: NextRequest) => Response` | `(req: NextRequest) => NextResponse` |
| Test pattern async | `const res = await handler(...)` | `const res = handler(...)` (sync) |
| `getClientIp` type cast | `request.ip ??` | `(request as NextRequest & { ip?: string }).ip ??` |

## Key Insight

Two things interacted to obscure the problems:

**Platform guarantees vs. defensive coding**: `x-vercel-forwarded-for` is documented as a single IP, so the missing split looked correct on a first read. The risk is not today's behavior but a future platform change. The split is a zero-cost invariant, not a workaround — when a guard costs nothing and the consequence of skipping it is a silent security regression, always write the guard.

**`NextRequest.ip` is read-only at the type level**: It is not a constructor option, so `new NextRequest(..., { ip })` does not exist. Tests that need a populated `.ip` must use `Object.defineProperty`. The consequence of skipping this is not a failing test but a test that appears to pass while covering nothing — the most dangerous kind of gap.

## Prevention & Best Practices

### 1. Avoiding Documentation Drift from Production Code

- **Single source of truth**: If a doc claims something is the "recommended pattern," that pattern must exist verbatim in production code. Never document a cleaned-up abstraction that diverges from what's actually deployed.
- **Link docs to specific code locations**: Include a file path and line reference (`src/middleware.ts:42`). Prose descriptions go stale silently; file references fail loudly.
- **Bidirectional signal**: Add a comment in production code referencing the doc: `// See docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md`. When code changes, the broken reference is a reminder to update the doc.

### 2. Writing Tests That Prove What They Claim to Prove

- **The failing-first rule**: Before trusting a test, temporarily break the invariant it claims to test. For a precedence test, flip the `??` chain — the test must go red. If it stays green, it is not a precedence test.
- **Precedence vs. isolation are different properties**:
  - *Isolation*: different IPs → different buckets
  - *Precedence*: both headers present with different IPs → the higher-priority header's IP wins. Requires a single request with *both* headers populated.
- **One claim per test**: If a test description contains "and" or "independent from," consider splitting it.

### 3. Defensive Guards vs. Trusting Platform Guarantees

- **If the guarantee is undocumented or informal, code defensively.** A `.split(',')[0]?.trim()` costs one line. The cost of being wrong is a silent rate-limit bypass.
- **The citation rule**: Any comment saying "X is guaranteed by platform Y, so we don't need guard Z" must include a URL. Without it, it's folklore. If you cannot produce the URL, write the guard.
- **Red flag phrase**: *"This is redundant because..."* followed by a platform assumption. Require a citation or require the guard.

### 4. Validating Documentation Code Snippets

- **Compile-test all snippets**: Extract snippets into a `spike/` file and run `tsc --noEmit`. If it doesn't compile, it's wrong.
- **Use the actual production imports**: Snippets must import from the same packages production code uses. Wrong imports are bugs, not simplifications.
- **Mark pseudocode explicitly**: Unlabeled snippets are assumed to be copy-paste ready. Snippets that are conceptual illustrations must be labeled `// pseudocode — do not copy directly`.
- **Async/await hygiene**: Flag any `await` in a snippet and verify the callee is actually async. TypeScript catches this if compiled; it won't be caught in Markdown.

## Related Documentation

- **`docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md`** — the vulnerability this review covered; updated by PR #7
- **`todos/100`** — defensive split on `x-vercel-forwarded-for` (resolved)
- **`todos/102`** — solution doc code snippet errors (resolved)
- **`todos/103`** — solution doc verbosity (resolved)
- **`todos/104`** — solution doc minor accuracy nits (resolved)
- **`todos/105`** — `request.ip` precedence test (resolved)
- **`todos/099`** — `unknown` shared bucket DoS risk (open)
- **Earlier rate-limit work:** [ErnieAtLYD/substack2eec#3](https://github.com/ErnieAtLYD/substack2eec/pull/3)
