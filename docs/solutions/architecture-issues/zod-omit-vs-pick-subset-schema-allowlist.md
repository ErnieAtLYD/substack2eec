---
title: "Use .pick() not .omit() when deriving subset Zod schemas from a shared parent"
description: "Route handlers that validate a subset of a shared Zod schema should use .pick() (allowlist) rather than .omit() (denylist). .pick() is forward-safe: new fields added to the parent schema are ignored by default. .omit() silently accepts every new field unless you remember to add it to the exclusion list."
problem_type: architecture_issue
module: src/app/api
tags: [zod, typescript, schema-composition, forward-safety, dry]
severity: medium
status: resolved
resolved_date: 2026-04-12
---

# Use `.pick()` not `.omit()` when deriving subset Zod schemas from a shared parent

## Problem

When a route needs only a subset of a shared schema's fields, the natural instinct is to use `.omit()` — "I'll just exclude the two fields I don't want." But `.omit()` is a denylist: every new field added to the parent schema in the future is silently accepted by the derived schema until someone notices and adds it to the exclusion list.

For routes that intentionally exclude sensitive or large fields (body content, credentials, internal state), `.omit()` creates a latent correctness and security gap.

## Root Cause

`src/app/api/propose-courses/route.ts` manually duplicated 7 fields already present on `SubstackPostSchema` in `src/types/index.ts`. The fix was to derive the schema from the canonical source. During that fix, `.omit({ bodyText: true, bodyHtml: true })` was initially considered but rejected in favour of `.pick({...})` because the route intentionally excludes large body fields and should continue to exclude any future large/sensitive fields added to `SubstackPostSchema`.

## Before

```ts
// Inline schema — manually maintained, will drift from SubstackPostSchema
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

## After

```ts
// Derived schema — single source of truth, no drift possible
import { SubstackPostSchema } from '@/types'

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

`bodyText` and `bodyHtml` are intentionally excluded — they account for ~97% of post payload size and are not needed by the propose-courses endpoint. The inferred TypeScript type from `.pick()` matched the existing `proposeCourseCandidates` function signature (`Pick<SubstackPost, 'slug' | 'title' | ...>[]`) exactly — no downstream changes required.

## Solution

Replace any inline `z.object({...})` that duplicates fields from a shared parent schema with a derived `.pick({...})` call on the parent. Choose `.pick()` over `.omit()` whenever the route intentionally excludes fields that are sensitive, large, or likely to be joined by similar fields in the future.

## Prevention

### Rule of Thumb

Instead of asking "what should I exclude?", ask "what does this route actually need?" If you can enumerate the required fields, use `.pick()`. If any excluded field is sensitive — large body content, credentials, internal state — use `.pick()`. Only reach for `.omit()` when the route needs almost everything from a small, stable parent schema.

One way to remember it: `.omit()` is a denylist that requires you to keep saying "no" to every new field. `.pick()` says "yes" only once, to exactly what you chose.

### When `.omit()` Is Acceptable

- The derived schema needs all but one or two fields (e.g., stripping an auto-generated `id` from an insert schema) and the parent is small and unlikely to grow.
- The parent schema is closed and versioned within the same file — no external contributors can extend it without a deliberate, reviewed change.
- The fields being omitted are structurally obvious (e.g., DB output fields that can never appear in user input), so accidental acceptance of a future field carries no risk.

### PR Checklist Item

- [ ] Any Zod schema derived via `.omit()` has been reviewed: confirm the route needs all remaining fields, no sensitive fields could be added to the parent in the future, and `.pick()` was considered and rejected for a documented reason.

## Related Solutions

- [`docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md`](./zod-schema-ts-interface-drift.md) — The parent pattern: define Zod schemas in `src/types/index.ts` as the single source of truth and derive TypeScript types via `z.infer<>`. This document is a specific application of that principle.
- [`docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md`](../security-issues/user-input-ai-param-allowlist-and-prompt-injection.md) — Allowlist validation of user-supplied parameters in route handlers — same "allowlist over denylist" principle applied to parameter values rather than schema fields.
