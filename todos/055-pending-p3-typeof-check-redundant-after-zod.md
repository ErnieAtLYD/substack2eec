---
status: pending
priority: p3
issue_id: "055"
tags: [code-review, simplicity, zod]
dependencies: [038]
---

# `typeof p.bodyText === 'string'` Check Is Redundant After Zod Validation

## Problem Statement

After `CurateRequestSchema.safeParse`, `bodyText` is guaranteed to be a `string` by the Zod schema. The `typeof` guard on line 43 adds noise and implies distrust of the Zod output, undermining the point of Zod.

## Findings

**Location:** `src/app/api/curate/route.ts:43`

```typescript
const posts = body.posts.map(p => ({
  ...p,
  bodyText: typeof p.bodyText === 'string' ? p.bodyText.slice(0, MAX_BODY_CHARS) : '',
}))
```

`body` is the typed output of `CurateRequestSchema.safeParse`. `p.bodyText` is `string` by TypeScript's type system — the `typeof` check is unreachable.

## Proposed Solution

```typescript
const posts = body.posts.map(p => ({
  ...p,
  bodyText: p.bodyText.slice(0, MAX_BODY_CHARS),
}))
```

Or move the cap into the Zod schema entirely (see todo 047):
```typescript
bodyText: z.string().max(100_000).transform(s => s.slice(0, MAX_BODY_CHARS)),
```
Which would eliminate the `.map()` post-parse entirely.

## Technical Details

**Affected file:** `src/app/api/curate/route.ts:43`

## Acceptance Criteria

- [ ] `typeof` guard removed; `p.bodyText.slice(0, MAX_BODY_CHARS)` called directly

## Work Log

- 2026-03-29: Found during code simplicity review of batch fixes (round 2)
