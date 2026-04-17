---
status: complete
priority: p3
issue_id: "124"
tags: [code-review, architecture, zod, schema-drift]
dependencies: []
---

# `GeneratedLessonSchema` Not Defined in `src/types/index.ts` — Schema Duplicated Inline in Export Route

## Problem Statement

The export route's `ExportRequestSchema` contains an inline Zod object that duplicates the shape of `GeneratedLesson` from `src/types/index.ts`. There is no `GeneratedLessonSchema` exported from types. If a field is added or renamed on `GeneratedLesson`, the inline schema here silently drifts — the type system will compile but the runtime validation will accept or reject the wrong shape. This is a known pattern per `docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md`.

## Findings

**Location:** `src/app/api/export/route.ts:6-14`

```ts
lessons: z.array(z.object({
  lessonNumber: z.number(),
  title: z.string().max(500),
  subjectLine: z.string().max(50),
  previewText: z.string().max(90),
  markdownBody: z.string().max(50_000),
  keyTakeaway: z.string().max(500),
  filename: z.string().regex(/^[a-z0-9][a-z0-9-]+\.md$/).max(80),
})).min(1).max(50),
```

**Location:** `src/types/index.ts` — `GeneratedLesson` interface exists but has no corresponding Zod schema.

**Known Pattern:** `docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md` documents this exact issue and recommends defining Zod schemas in `src/types/index.ts` and deriving TypeScript types via `z.infer`.

## Proposed Solutions

### Option A: Create `GeneratedLessonSchema` in `src/types/index.ts` and derive the interface (Recommended)
```ts
// src/types/index.ts
export const GeneratedLessonSchema = z.object({
  lessonNumber: z.number(),
  title: z.string().max(500),
  subjectLine: z.string().max(50),
  previewText: z.string().max(90),
  markdownBody: z.string().max(50_000),
  keyTakeaway: z.string().max(500),
  filename: z.string().regex(/^[a-z0-9][a-z0-9-]+\.md$/),
})
export type GeneratedLesson = z.infer<typeof GeneratedLessonSchema>
```

Then in the route:
```ts
import { GeneratedLessonSchema } from '@/types'

const ExportRequestSchema = z.object({
  lessons: z.array(GeneratedLessonSchema).min(1).max(50),
  ...
})
```

- Single source of truth for `GeneratedLesson` shape
- Pros: Eliminates drift, follows established codebase pattern
- Cons: Small refactor touching types and route

### Option B: Keep inline, add a comment pointing to types
Low value — the drift problem persists.

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/types/index.ts`, `src/app/api/export/route.ts:6-14`
- **Effort:** Small
- **Known Pattern:** See `docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md`

## Work Log

- 2026-04-16: Identified by TypeScript reviewer and learnings researcher during code review of PR `fix/export-edge-cases-060-061-062`

## Resources

- Known pattern: `docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md`
