---
title: "fix: courseTitle empty string breaks export contract"
type: fix
status: completed
date: 2026-04-16
---

# fix: `courseTitle: ""` Returns 400 Instead of Graceful Fallback

## Problem Statement

`ExportRequestSchema` has `.min(1)` on `courseTitle`, which rejects `""` with a 400. But `CuratedSelectionSchema` has no `.min(1)`, so the AI can legitimately emit `courseTitle: ""` from the curate step. An agent forwarding that directly to `/api/export` now gets a 400 where it previously got a silent fallback to `'Email Course'`. Additionally, `ExportRequest` interface declares `courseTitle: string` (required), but the schema's `.default()` makes it optional — the TypeScript type is a lie.

## Acceptance Criteria

- [x] `POST /api/export` with `courseTitle: ""` returns 200 with `'Email Course'` fallback (not 400)
- [x] `POST /api/export` with `courseTitle` omitted returns 200 with `'Email Course'` fallback
- [x] `ExportRequest` interface accurately reflects that `courseTitle` is optional
- [x] Agent following CLAUDE.md API docs can successfully call export with a `CuratedSelection` that has an empty `courseTitle`

## Proposed Solution — Option A (Recommended)

Replace `.min(1)` with a `.transform()` that coerces empty strings to the default. This restores the original graceful-fallback contract without any cascade changes.

**`src/app/api/export/route.ts:15`** — change:
```ts
// before
courseTitle: z.string().min(1).max(200).default('Email Course'),

// after
courseTitle: z.string().max(200).default('Email Course').transform(v => v || 'Email Course'),
```

**`src/types/index.ts`** — update `ExportRequest` interface:
```ts
// before
export interface ExportRequest {
  lessons: GeneratedLesson[]
  courseTitle: string       // required — but schema has .default(), so this is a lie
  courseDescription: string
}

// after
export interface ExportRequest {
  lessons: GeneratedLesson[]
  courseTitle?: string      // optional; defaults to 'Email Course' at export time
  courseDescription: string
}
```

## Context

- **Files affected:** `src/app/api/export/route.ts:15`, `src/types/index.ts:84-88`
- **Breaking change introduced by:** PR `fix/export-edge-cases-060-061-062`, commit `dc7256c`
- **Behavioral shift:** `courseTitle: ""` went from 200+fallback → 400
- Option B (add `.min(1)` to `CuratedSelectionSchema` upstream) is a broader change requiring a separate PR touching the curate route; deferred unless Option A is insufficient.

## Sources

- Todo: `todos/116-pending-p1-courseTitle-empty-string-contract-break.md`
- Export schema: `src/app/api/export/route.ts:5-17`
- Type definitions: `src/types/index.ts:22-28` (`CuratedSelectionSchema`), `src/types/index.ts:84-88` (`ExportRequest`)
