---
status: pending
priority: p3
issue_id: "131"
tags: [code-review, dead-code, simplicity]
dependencies: []
---

# `buildReadme` Has Dead Null-Coalescing and Redundant Slice Guards

## Problem Statement

`buildReadme` in `src/lib/export.ts` applies `?? ''` null-coalescing and `.slice(0, 200)` / `.slice(0, 1000)` truncation to `courseTitle` and `courseDescription`. Both guards are unreachable: `buildZip` is only ever called from the export route after `ExportRequestSchema` validation, which guarantees both fields are non-null strings within the schema's `.max()` bounds. The guards create a false impression that these values might be null or oversized at this call site.

## Findings

**Location:** `src/lib/export.ts:11-12`

```ts
const safeTitle = (courseTitle ?? '').slice(0, 200)
const safeDescription = (courseDescription ?? '').slice(0, 1000)
```

- `courseTitle ?? ''` — unreachable: schema guarantees non-null via `.default('Email Course').transform(...)`
- `.slice(0, 200)` — redundant: schema `.max(200)` already enforces this
- `courseDescription ?? ''` — unreachable: schema guarantees non-null via `.default('')`
- `.slice(0, 1000)` — redundant: schema `.max(1000)` already enforces this

## Proposed Solutions

### Option A: Remove guards and use parameters directly (Recommended)
```ts
return `# ${courseTitle}

${courseDescription}
...`
```
- Eliminates dead variable declarations
- Makes clear that the values are already clean at this point
- Pros: Simpler, more honest about invariants
- Cons: If `buildZip` is ever called from a new code path without schema validation, the guards are gone

### Option B: Keep guards with a comment explaining they are defense-in-depth
```ts
// Defense-in-depth: schema guarantees these are non-null within bounds, but buildZip has no server-only validation
const safeTitle = (courseTitle ?? '').slice(0, 200)
```
- Pros: Explicit about why the guards exist
- Cons: Verbose; the comment would need updating if schema constraints change

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/lib/export.ts:11-12`
- **Effort:** Trivial

## Acceptance Criteria

- [ ] No unreachable `?? ''` or redundant `.slice()` guards in `buildReadme`
- [ ] OR: Comment explicitly documents the intent of the guards

## Work Log

- 2026-04-16: Identified by code simplicity reviewer during code review of `fix/export-todos-117-125`
