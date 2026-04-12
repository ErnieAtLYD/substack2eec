---
status: pending
priority: p3
issue_id: "053"
tags: [code-review, correctness]
dependencies: []
---

# `Retry-After` Header Is Hardcoded to `'60'` Instead of Derived from Window Config

## Problem Statement

The middleware always returns `Retry-After: 60` regardless of the actual window configured in `LIMITS`. Right now all three routes use `windowMs: 60_000` so the header is accidentally correct, but any change to a route's window will silently produce a wrong `Retry-After` value.

## Findings

**Location:** `src/middleware.ts:45`

```typescript
return new NextResponse('Too Many Requests', {
  status: 429,
  headers: { 'Retry-After': '60' },  // hardcoded — ignores config.windowMs
})
```

`LIMITS['/api/curate'].windowMs` is `60_000`, but nothing connects that value to the header.

## Proposed Solution

```typescript
return new NextResponse('Too Many Requests', {
  status: 429,
  headers: { 'Retry-After': String(Math.ceil(config.windowMs / 1000)) },
})
```

`config` is already in scope at the call site.

## Technical Details

**Affected file:** `src/middleware.ts:45`

## Acceptance Criteria

- [ ] `Retry-After` value is derived from the route's `windowMs`, not hardcoded

## Work Log

- 2026-03-29: Found during TypeScript review of batch fixes (round 2)
