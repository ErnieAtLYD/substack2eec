---
title: "Zod schema tightening broke graceful fallback — courseTitle empty string now 400"
slug: zod-schema-tightening-broke-pipeline-contract
date: 2026-04-16
problem_type: logic-error
component: export-api
symptoms:
  - "POST /api/export with courseTitle:\"\" returns 400 instead of 200"
  - "Agent forwarding CuratedSelection with empty courseTitle gets unexpected 400"
  - "ExportRequest TypeScript interface inconsistent with schema behavior (type said required, schema had default)"
technologies:
  - nextjs
  - zod
  - typescript
tags:
  - api-contract
  - schema-validation
  - backward-compatibility
  - zod
  - typescript
related_todos:
  - "116"
---

## Problem Statement

`ExportRequestSchema` in `src/app/api/export/route.ts` applied `.min(1)` to `courseTitle`, causing the export endpoint to return 400 when `courseTitle: ""` was submitted. This became a live pipeline failure because `CuratedSelectionSchema` in `src/types/index.ts` carries no `.min(1)` constraint — the AI curate step can legitimately emit an empty string for `courseTitle`. A secondary mismatch existed in the `ExportRequest` TypeScript interface, which declared `courseTitle: string` (required) while the Zod schema's `.default()` made it optional at runtime.

## Root Cause

The `.min(1)` constraint was added at the export layer without propagating the requirement upstream or providing a defensive fallback. The pipeline has two distinct ownership boundaries: `CuratedSelectionSchema` owns the AI output contract and permits `""`, while `ExportRequestSchema` owns the inbound HTTP contract. Tightening the downstream schema without either (a) enforcing the constraint upstream or (b) normalizing the value at the boundary created a guaranteed breakage path for any AI response that produced an empty `courseTitle`.

The TypeScript interface mismatch (`courseTitle: string` vs. schema `.default('Email Course')`) was a secondary issue that allowed callers to omit the field at the type level without the interface reflecting that optionality.

## Solution

**`src/app/api/export/route.ts:15`** — replace `.min(1)` with a transform that coerces empty strings to the fallback:

```ts
// Before — rejects "" with 400
courseTitle: z.string().min(1).max(200).default('Email Course'),

// After — transforms "" to fallback, restores 200
courseTitle: z.string().max(200).default('Email Course').transform(v => v || 'Email Course'),
```

**`src/types/index.ts` — `ExportRequest` interface** — align the type with actual schema behavior:

```ts
// Before — type says required, schema says optional → mismatch
export interface ExportRequest {
  lessons: GeneratedLesson[]
  courseTitle: string
  courseDescription: string
}

// After — matches schema behavior
export interface ExportRequest {
  lessons: GeneratedLesson[]
  courseTitle?: string
  courseDescription: string
}
```

**`src/__tests__/export-route.test.ts`** — four regression cases:
- `courseTitle: ""` → 200, slug is `email-course-eec.zip`
- `courseTitle` omitted → 200
- `courseTitle: "My Great Course"` → 200, slug is `my-great-course-eec.zip`
- `lessons: []` → 400 (existing guard unaffected)

## Why Transform Over `.min(1)` Upstream

Adding `.min(1)` to `CuratedSelectionSchema` would enforce the constraint on AI output, but the AI is not a reliable producer — it can return empty strings. Raising a validation error on AI output pushes failure earlier in the pipeline but does not eliminate it. The correct posture at a boundary accepting AI-produced data is **defensive normalization**: accept the range of values the producer can emit and coerce degenerate cases to a safe default. The `.transform(v => v || 'Email Course')` approach treats `""` and `undefined` identically to an absent field, consistent with what `.default('Email Course')` already does for the missing-field case. This keeps `CuratedSelectionSchema` as a faithful description of AI output (permissive) while ensuring the export layer always has a usable string.

## Prevention Strategies

### 1. Share field schemas across pipeline stages

Extract shared field schemas into a common module (e.g., `src/lib/schemas.ts`) as named constants:

```ts
export const CourseTitleSchema = z.string().max(200).default('Email Course').transform(v => v || 'Email Course')
```

Both `CuratedSelectionSchema` and `ExportRequestSchema` import and reuse the constant. A tightening change propagates everywhere automatically.

### 2. TypeScript interface / Zod schema parity

`src/types/index.ts` owns the canonical TypeScript interfaces. If the interface says `courseTitle: string`, neither schema can add `.min(1)` unless the type is also updated. Use `z.infer<>` to derive types from schemas rather than maintaining parallel definitions:

```ts
// Derive the type from the schema — they can't drift
export type ExportRequest = z.infer<typeof ExportRequestSchema>
```

### 3. Producer-consumer contract test

When a route schema is modified, add a test that feeds the minimum valid output from the upstream producer directly into the downstream schema's `.parse()`. If `CuratedSelectionSchema` permits `""`, the export schema must accept it too.

### 4. PR review checklist

When a PR adds `.min()`, `.max()`, `.regex()`, or `.refine()` to a Zod field that also appears in another route or shared type, explicitly verify all upstream producers satisfy the new constraint before merging.

## Warning Signs

- A field name appears in more than one `*Schema` definition across different route files
- A PR adds a Zod constraint without a corresponding change to `src/types/index.ts`
- The words "tighten", "validate", or "guard" appear in a commit message that only touches one route file
- A Zod schema is defined inline in a route rather than imported from a shared module

## Related

- `docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md` — canonical pattern: use Zod as single source of truth, derive TS types via `z.infer<>`
- `docs/solutions/architecture-issues/zod-omit-vs-pick-subset-schema-allowlist.md` — related schema safety pattern
- Todo `#116` — the original issue report
- CLAUDE.md `### Step 3 — POST /api/export` — documents `courseTitle: string` in the API contract (note: does not document empty-string behavior — update if adding `.min(1)` in future)
