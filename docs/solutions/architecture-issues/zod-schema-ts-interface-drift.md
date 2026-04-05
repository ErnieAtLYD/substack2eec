---
title: "Zod-first types: eliminate schema drift between TypeScript interfaces and Zod schemas"
description: "Define Zod schemas as the source of truth in src/types/index.ts and derive TypeScript types via z.infer to prevent TS/Zod drift and duplication across routes"
problem_type: architecture_issue
module: src/types
tags: [zod, typescript, schema-drift, dry, validation]
severity: medium
status: resolved
resolved_date: 2026-04-04
---

# Zod Schema / TypeScript Interface Drift

## Problem

`CuratedLesson` and `CuratedSelection` were defined as plain TypeScript interfaces in `src/types/index.ts`, but their Zod validation schemas were copy-pasted locally in `src/app/api/curate/route.ts`. Constants like `MAX_BODY_CHARS` and helpers like `isLessonCount` were duplicated across `curate/route.ts` and `propose-courses/route.ts`.

Because the two definitions lived in different files with no mechanical link, a field change in one would silently diverge from the other — the TypeScript compiler never catches this mismatch.

## Root Cause

TypeScript interfaces defined in `src/types/index.ts` were used for compile-time type checking, but runtime validation in route handlers required separate Zod schemas that mirrored the same shapes. Constants like `MAX_BODY_CHARS` and helpers like `isLessonCount` were similarly duplicated across routes. There was no enforcement mechanism linking them.

## Before

```ts
// src/types/index.ts — TypeScript interface only
export interface CuratedLesson {
  slug: string
  sequencePosition: number
  lessonFocus: string
  selectionRationale: string
}

export interface CuratedSelection {
  courseTitle: string
  courseDescription: string
  targetAudience: string
  overallRationale: string
  lessons: CuratedLesson[]
}

// src/app/api/curate/route.ts — duplicated Zod schema, manually kept in sync
const CuratedLessonSchema = z.object({
  slug: z.string().max(500),            // ← different constraints than interface implies
  sequencePosition: z.number().int().min(1).max(10),
  lessonFocus: z.string().max(300),
  selectionRationale: z.string().max(300),
})

const CuratedSelectionSchema = z.object({
  courseTitle: z.string().max(60),
  // ...copy-pasted, must be manually updated when interface changes
})

// src/app/api/propose-courses/route.ts — yet another inline posts schema
const ProposeRequestSchema = z.object({
  posts: z.array(z.object({
    slug: z.string().max(500),
    title: z.string().max(500),
    // ...repeated field-by-field, diverges silently
  }))
})
```

## After

```ts
// src/types/index.ts — Zod schemas are the single source of truth
import { z } from 'zod'

export const CuratedLessonSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(100),
  sequencePosition: z.number().int().min(1).max(10),
  lessonFocus: z.string().max(300),
  selectionRationale: z.string().max(300),
})

export const CuratedSelectionSchema = z.object({
  courseTitle: z.string().max(60),
  lessons: z.array(CuratedLessonSchema).min(1).max(10),
  // ...
})

export const SubstackPostSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(100),
  // ... all validation constraints in one place
})

// TypeScript types derived from schemas — no separate interface needed
export type CuratedLesson = z.infer<typeof CuratedLessonSchema>
export type CuratedSelection = z.infer<typeof CuratedSelectionSchema>

// Shared constants and helpers live here too
export const MAX_BODY_CHARS = 15_000
export function isLessonCount(value: unknown): value is LessonCount {
  return (ALLOWED_LESSON_COUNTS as ReadonlyArray<unknown>).includes(value)
}

// src/app/api/curate/route.ts — imports schema directly, no local copy
import { MAX_BODY_CHARS, CuratedSelectionSchema, SubstackPostSchema, isLessonCount } from '@/types'

const CurateRequestSchema = z.object({
  posts: z.array(SubstackPostSchema).min(1).max(50),
  lessonCount: z.number(),
  selectedCourse: CuratedSelectionSchema.optional(),
})
```

**Key insight:** Defining Zod schemas as the canonical source in `src/types/index.ts` and deriving TypeScript types from them with `z.infer<>` eliminates the interface-schema split entirely — there is only one definition to update when a field changes.

## Prevention

**Detect early:** In code review, flag any file that imports a TypeScript interface and also defines a `z.object({...})` with overlapping field names. Also flag constants (like `MAX_BODY_CHARS`) or type guards (like `isLessonCount`) that appear in more than one file — duplication is a signal that a shared module is missing.

**Rule of thumb:** If a shape crosses an API boundary, define it once as a Zod schema in `types/index.ts` and derive the TypeScript type with `z.infer<>` — never maintain both separately.

**PR checklist item:**
- [ ] New API shapes: Is the Zod schema the single source of truth? Confirm no parallel `interface` or `type` alias exists for the same shape, and that shared constants/validators live in `types/index.ts`, not inline in route files.

## Related Solutions

- [`docs/solutions/build-errors/nextjs-eager-env-validation-module-load.md`](../build-errors/nextjs-eager-env-validation-module-load.md) — prior example of Zod-first schema with `z.infer<>` for type derivation in this codebase (the `env.ts` pattern)
- [`docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md`](../security-issues/user-input-ai-param-allowlist-and-prompt-injection.md) — the `ALLOWED_LESSON_COUNTS` / `LessonCount` pattern is a prior case of shared-type drift that motivated this approach
- [`docs/solutions/security-issues/prompt-injection-llm-pipeline.md`](../security-issues/prompt-injection-llm-pipeline.md) — Zod validation on `/api/curate` body closes the known gap noted in todos/038
