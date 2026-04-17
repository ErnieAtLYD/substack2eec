---
status: complete
priority: p3
issue_id: "123"
tags: [code-review, security, defense-in-depth]
dependencies: []
---

# `buildZip` Has No Internal Path Guard — ZIP-Slip Protected Only at Call-Site Schema Layer

## Problem Statement

`buildZip` in `src/lib/export.ts` uses `lesson.filename` directly as the ZIP entry name without any internal validation. ZIP-slip is currently prevented by the Zod regex in the export route (`/^[a-z0-9][a-z0-9-]+\.md$/`), but `buildZip` is not safe-by-construction — if it's ever called from a code path that bypasses schema validation, path traversal becomes possible. Defense-in-depth would add a guard inside `buildZip` itself.

## Findings

**Location:** `src/lib/export.ts:41` (approximate)

```ts
zip.file(lesson.filename, lesson.markdownBody)  // trusts caller to pre-validate filename
```

ZIP-slip defense lives entirely in the route schema. `buildZip` implicitly trusts its callers.

## Proposed Solutions

### Option A: Add a `path.basename` check inside `buildZip`
```ts
import path from 'path'

// Inside buildZip, before zip.file():
const safeName = path.basename(lesson.filename)
if (safeName !== lesson.filename) {
  throw new Error(`Invalid lesson filename: ${lesson.filename}`)
}
zip.file(safeName, lesson.markdownBody)
```
- Makes `buildZip` safe regardless of caller
- Pros: Defense-in-depth, function is safe-by-construction
- Cons: Adds a check that's currently redundant

### Option B: Re-apply the filename regex inside `buildZip`
```ts
const FILENAME_RE = /^[a-z0-9][a-z0-9-]+\.md$/
if (!FILENAME_RE.test(lesson.filename)) throw new Error(...)
```
- Mirrors the schema constraint at the library level
- Pros: Explicit, self-documenting
- Cons: Duplicates the regex

### Option C: Accept current state (schema is the guard, single path to buildZip)
The export route is the only caller of `buildZip`. The schema is the correct boundary.

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/lib/export.ts`
- **Effort:** Small

## Work Log

- 2026-04-16: Identified by security sentinel during code review of PR `fix/export-edge-cases-060-061-062`
