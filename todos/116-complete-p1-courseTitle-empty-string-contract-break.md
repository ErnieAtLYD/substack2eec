---
status: complete
priority: p1
issue_id: "116"
tags: [code-review, api-contract, zod, breaking-change]
dependencies: []
---

# `courseTitle: ""` Now Returns 400 Instead of Graceful Fallback — Breaking Change + Interface Drift

## Problem Statement

The PR adds `.min(1)` to `courseTitle` in `ExportRequestSchema`, which rejects empty-string values with a 400. But `CuratedSelectionSchema` in `src/types/index.ts` has no `.min(1)` on `courseTitle` — the AI can legitimately emit an empty `courseTitle` from the curate step, and an agent forwarding that directly to `/api/export` now gets a 400 where it previously got a silent fallback to `'Email Course'`. Additionally, `ExportRequest` interface says `courseTitle: string` (required), but the schema now makes it optional via `.default()` — the TypeScript type is now a lie.

## Findings

**Location 1:** `src/app/api/export/route.ts:15`
```ts
courseTitle: z.string().min(1).max(200).default('Email Course'),
```
`.min(1)` rejects `""` with a parse error → 400. Previously `""` was accepted and `|| 'Email Course'` provided the fallback.

**Location 2:** `src/types/index.ts` — `CuratedSelectionSchema`
```ts
courseTitle: z.string().max(60)  // no .min(1)
```
AI can produce `courseTitle: ""` from the curate step. Agent forwarding this to export now gets 400.

**Location 3:** `src/types/index.ts` — `ExportRequest` interface
```ts
courseTitle: string  // marked required, but schema has .default() making it optional
```
The published interface is inconsistent with the schema's actual behavior.

## Proposed Solutions

### Option A: Replace `.min(1)` with `.transform()` (Recommended — backward-compatible)
```ts
courseTitle: z.string().max(200).default('Email Course').transform(v => v || 'Email Course'),
```
- Empty string → transformed to `'Email Course'` → 200, no break
- Omitted field → default → 200
- Preserves the original graceful-fallback contract
- Pros: backward-compatible, no cascade changes needed
- Cons: slightly less strict than `.min(1)` at the schema layer

### Option B: Add `.min(1)` upstream in `CuratedSelectionSchema` + update interface
```ts
// src/types/index.ts — CuratedSelectionSchema
courseTitle: z.string().min(1).max(60),

// src/types/index.ts — ExportRequest interface
courseTitle?: string  // optional, defaults to 'Email Course'
```
- Fails earlier (at curate time) if AI emits empty courseTitle
- Requires separate PR touching the curate route schema and type
- Pros: clean contract consistency throughout pipeline
- Cons: broader change, requires curate route update

### Option C: Document the constraint explicitly
- Add min(1) note to CLAUDE.md Step 3 API contract
- Only valid if Option B is done — documenting a surprise 400 without fixing the upstream producer is insufficient

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/app/api/export/route.ts:15`, `src/types/index.ts`
- **Components:** Export route, type system, agent API contract
- **Breaking change:** Yes — `courseTitle: ""` behavioral change from 200→400

## Acceptance Criteria

- [ ] `POST /api/export` with `courseTitle: ""` returns 200 with graceful fallback (OR 400 is documented and CuratedSelectionSchema rejects empty courseTitle upstream)
- [ ] `ExportRequest` interface accurately reflects whether `courseTitle` is required or optional
- [ ] Agent following CLAUDE.md API docs can successfully call export with a `CuratedSelection` that has an empty `courseTitle`

## Work Log

- 2026-04-16: Identified by TypeScript reviewer and agent-native reviewer during code review of PR `fix/export-edge-cases-060-061-062`

## Resources

- PR branch: `fix/export-edge-cases-060-061-062`
- Affected file: `src/app/api/export/route.ts`
- Related schema: `src/types/index.ts` — `CuratedSelectionSchema`, `ExportRequest`
