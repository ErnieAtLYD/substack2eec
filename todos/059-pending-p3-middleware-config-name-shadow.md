---
status: pending
priority: p3
issue_id: "059"
tags: [code-review, clarity]
dependencies: []
---

# Local `config` Variable in Middleware Shadows the Exported `config`

## Problem Statement

`src/middleware.ts` has a local `const config = LIMITS[pathname]` inside the `middleware` function, and also exports `export const config = { matcher: [...] }`. Both are named `config`. While there is no runtime conflict (the local is function-scoped), the name collision is confusing to read — a reader scanning the file sees two `config` values and must track scope to understand which is which.

## Findings

**Location:** `src/middleware.ts:35` (local) and `src/middleware.ts:54` (exported)

```typescript
export function middleware(request: NextRequest) {
  const config = LIMITS[pathname]   // ← local "config"
  // ...
  headers: { 'Retry-After': String(Math.ceil(config.windowMs / 1000)) },
}

export const config = {             // ← exported "config" (Next.js matcher)
  matcher: ['/api/curate', '/api/fetch-posts', '/api/export'],
}
```

## Proposed Solution

Rename the local variable:
```typescript
const rateLimitConfig = LIMITS[pathname]
if (!rateLimitConfig) return NextResponse.next()
// ...
headers: { 'Retry-After': String(Math.ceil(rateLimitConfig.windowMs / 1000)) },
```

## Technical Details

**Affected file:** `src/middleware.ts:35`

## Acceptance Criteria

- [ ] Local variable renamed to `rateLimitConfig` (or similar)
- [ ] No collision with exported `config`

## Work Log

- 2026-03-29: Found during TypeScript review of batch fixes (round 2)
