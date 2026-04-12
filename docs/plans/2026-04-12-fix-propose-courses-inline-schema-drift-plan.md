---
title: "fix: eliminate inline post schema drift in propose-courses route"
type: fix
status: completed
date: 2026-04-12
---

# fix: eliminate inline post schema drift in propose-courses route

`src/app/api/propose-courses/route.ts` defines a 7-field inline Zod schema for posts instead of importing `SubstackPostSchema` from `@/types`. This contradicts the Zod-first architecture established in this PR and creates a silent drift surface — a field constraint change in `SubstackPostSchema` will not propagate to this route without a manual update.

## Problem Statement / Motivation

The PR introduced `SubstackPostSchema` in `src/types/index.ts` as the single source of truth for post validation. `curate/route.ts` already imports it (`posts: z.array(SubstackPostSchema).min(1).max(50)`). However `propose-courses/route.ts` was not updated — it still carries a manually copied inline schema that duplicates every field constraint:

```ts
// src/app/api/propose-courses/route.ts:9-17 — BEFORE (inline, manually kept in sync)
const ProposeRequestSchema = z.object({
  posts: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(100),
    title: z.string().max(500),
    subtitle: z.string().max(500).nullable(),
    publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
    wordCount: z.number().int().min(0).max(100_000),
    excerpt: z.string().max(500),
    audience: z.enum(['everyone', 'paid']),
  })).min(1).max(50),
  lessonCount: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]).optional(),
})
```

The route intentionally excludes `bodyText` and `bodyHtml` (stripping them in the client call to reduce payload ~97%). This is correct, and `.omit()` preserves that intent while using the canonical schema.

## Proposed Solution

Replace the inline `z.object({...})` with `SubstackPostSchema.pick({...})`. Use `.pick()` rather than `.omit()` — an allowlist is forward-safe: new fields added to `SubstackPostSchema` in the future are ignored by default. `.omit()` would silently start accepting any new field.

```ts
// src/app/api/propose-courses/route.ts — AFTER
import { SubstackPostSchema } from '@/types'  // add to existing import

const ProposeRequestSchema = z.object({
  posts: z.array(SubstackPostSchema.pick({
    slug: true,
    title: true,
    subtitle: true,
    publishedAt: true,
    wordCount: true,
    excerpt: true,
    audience: true,
  })).min(1).max(50),
  lessonCount: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]).optional(),
})
```

**Type compatibility:** `proposeCourseCandidates` in `src/lib/ai.ts` is already typed as:
```ts
posts: Pick<SubstackPost, 'slug' | 'title' | 'subtitle' | 'publishedAt' | 'wordCount' | 'excerpt' | 'audience'>[]
```
The inferred type from `.pick()` above matches exactly — no function signature change needed.

The import line currently reads:
```ts
import type { LessonCount, ProposeCoursesResponse } from '@/types'
```
It must become a mixed import (value + type):
```ts
import { SubstackPostSchema } from '@/types'
import type { LessonCount, ProposeCoursesResponse } from '@/types'
```
Or combined:
```ts
import { SubstackPostSchema, type LessonCount, type ProposeCoursesResponse } from '@/types'
```

## Acceptance Criteria

- [x] `ProposeRequestSchema.posts` element schema uses `SubstackPostSchema.pick({...})` — no inline `z.object({...})` for post fields
- [x] `SubstackPostSchema` imported as a value (not type) from `@/types`
- [x] No inline field definitions for `slug`, `title`, `subtitle`, `publishedAt`, `wordCount`, `excerpt`, `audience` remain in `propose-courses/route.ts`
- [x] `lessonCount` union and array `.min(1).max(50)` are unchanged
- [x] `npx tsc --noEmit` passes

## Context

- **One file changed:** `src/app/api/propose-courses/route.ts`
- **Zero behavior change:** field constraints are identical field-for-field (verified by comparison)
- **Pattern reference:** `src/app/api/curate/route.ts:10` — established import pattern

## Sources

- Solution doc: `docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md` — documents the Zod-first invariant and the PR checklist item this fix enforces
- Canonical schema: `src/types/index.ts:30–40` (`SubstackPostSchema`)
- Established pattern: `src/app/api/curate/route.ts:10` (`posts: z.array(SubstackPostSchema).min(1).max(50)`)
