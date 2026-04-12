---
status: pending
priority: p3
issue_id: "063"
tags: [code-review, zod, correctness]
dependencies: []
---

# `lessonNumber` in Export Schema Accepts Floats and Large Numbers

## Problem Statement

`lessonNumber: z.number()` in `ExportRequestSchema` accepts floats (e.g. `1.5`), very large numbers, and in some Zod versions `NaN`. A float `lessonNumber` lands in `buildReadme`'s TOC as-is, producing a malformed entry like `1.5. **Title** — filename.md`. Not a security issue but a data integrity gap.

## Findings

**Location:** `src/app/api/export/route.ts:8`

```typescript
lessonNumber: z.number(),   // accepts 1.5, 999, NaN
```

The lesson number is used in `buildReadme` (`l.lessonNumber` in the TOC string) and as a structural identifier. It should be a positive integer bounded by the lessons array max (50).

## Proposed Solution

```typescript
lessonNumber: z.number().int().min(1).max(50),
```

## Technical Details

**Affected file:** `src/app/api/export/route.ts:8`

## Acceptance Criteria

- [ ] `lessonNumber` rejects non-integers and values outside `[1, 50]`

## Work Log

- 2026-03-29: Found during security review of P1 fixes
