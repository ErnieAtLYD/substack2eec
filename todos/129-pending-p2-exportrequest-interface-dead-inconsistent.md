---
status: pending
priority: p2
issue_id: "129"
tags: [code-review, architecture, dead-code, zod]
dependencies: []
---

# `ExportRequest` Interface Is Dead Code and Inconsistent with `ExportRequestSchema`

## Problem Statement

`src/types/index.ts` exports an `ExportRequest` interface that no module imports. It predates the Zod schema approach and was not cleaned up when `ExportRequestSchema` was introduced. It now actively misleads: it declares `courseDescription: string` (required) while the schema has `.default('')` (effectively optional). A future caller typing against `ExportRequest` would think `courseDescription` is required, but omitting it would silently succeed at runtime.

## Findings

**Location:** `src/types/index.ts:86-90`

```ts
export interface ExportRequest {
  lessons: GeneratedLesson[]
  courseTitle?: string         // optional — correct, schema has .default()
  courseDescription: string    // required — WRONG, schema has .default('')
}
```

Current `ExportRequestSchema`:
```ts
courseDescription: z.string().max(1000).default(''),  // optional with default
```

No module imports `ExportRequest` (confirmed by grep — appears only in its own declaration). The route uses `ExportRequestSchema` directly.

**Known Pattern:** `docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md` — the canonical recommendation is to derive TypeScript types from Zod schemas via `z.infer<>`, eliminating the possibility of drift.

## Proposed Solutions

### Option A: Delete the interface entirely (Recommended)
```ts
// Remove lines 86-90 from src/types/index.ts
```
- Nothing imports it; deletion has zero downstream impact
- Pros: Eliminates the misleading contract artifact
- Cons: None

### Option B: Replace with a derived type
```ts
export type ExportRequest = z.input<typeof ExportRequestSchema>
```
- `z.input<>` gives the pre-transform/pre-default shape (what callers must supply)
- Pros: Documents the wire shape for external consumers
- Cons: Slightly more complex; only needed if something external actually types against it

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/types/index.ts:86-90`
- **Effort:** Trivial (delete 5 lines, or replace with 1-line derived type)
- **Known Pattern:** `docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md`

## Acceptance Criteria

- [ ] No orphaned interface with stale field requirements exists in `src/types/index.ts`
- [ ] TypeScript compiler still passes (no import breaks)

## Work Log

- 2026-04-16: Identified by TypeScript reviewer, code simplicity reviewer, and agent-native reviewer during code review of `fix/export-todos-117-125`
