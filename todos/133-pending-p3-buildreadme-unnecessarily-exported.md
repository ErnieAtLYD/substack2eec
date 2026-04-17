---
status: pending
priority: p3
issue_id: "133"
tags: [code-review, simplicity, yagni]
dependencies: []
---

# `buildReadme` Is Unnecessarily Exported — YAGNI

## Problem Statement

`buildReadme` in `src/lib/export.ts` is exported (`export function buildReadme`) but has only one caller: `buildZip` in the same file. No test or external module imports it directly. Exporting it creates an implicit public API commitment for a function that is an implementation detail of `buildZip`.

## Findings

**Location:** `src/lib/export.ts:6`

```ts
export function buildReadme(  // ← export is unnecessary
```

Callers: only `buildZip` at line 39 in the same file. Tests mock the entire `@/lib/export` module and do not import `buildReadme` directly.

## Proposed Solutions

### Option A: Remove `export` keyword (Recommended)
```ts
function buildReadme(
```
- Makes `buildZip` the sole public surface of `src/lib/export.ts`
- If tests ever need `buildReadme` independently, that is a signal to restructure the test, not export the function
- Pros: Reduces exported API surface, YAGNI
- Cons: None

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/lib/export.ts:6`
- **Effort:** Trivial (remove one keyword)

## Work Log

- 2026-04-16: Identified by code simplicity reviewer during code review of `fix/export-todos-117-125`
