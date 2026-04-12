---
status: pending
priority: p3
issue_id: "064"
tags: [code-review, simplicity, dead-code]
dependencies: []
---

# `ExportRequest` Interface in `src/types/index.ts` Is Unreferenced Dead Code

## Problem Statement

`ExportRequest` was the type used in the old export route (`const body: ExportRequest = await request.json()`). The export route now uses the Zod schema's inferred type, so `ExportRequest` is no longer imported anywhere. Leaving it in `types/index.ts` creates maintenance confusion — a developer might add fields to `ExportRequest` thinking it governs the export contract, when the actual contract is the Zod schema.

## Findings

**Location:** `src/types/index.ts:56-60`

```typescript
export interface ExportRequest {
  lessons: GeneratedLesson[]
  courseTitle: string
  courseDescription: string
}
```

No file in the codebase imports `ExportRequest`.

## Proposed Solution

Delete the `ExportRequest` interface from `src/types/index.ts`.

## Technical Details

**Affected file:** `src/types/index.ts:56-60`

## Acceptance Criteria

- [ ] `ExportRequest` removed from `src/types/index.ts`
- [ ] `npx tsc --noEmit` passes

## Work Log

- 2026-03-29: Found during TypeScript review of P1 fixes
