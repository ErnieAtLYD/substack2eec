---
status: pending
priority: p3
issue_id: "135"
tags: [code-review, testing, security, defense-in-depth]
dependencies: []
---

# No Unit Test for `buildZip`'s `path.basename` Path-Traversal Guard

## Problem Statement

`src/lib/export.ts` was given a `path.basename` guard explicitly as defense-in-depth against ZIP-slip:
```ts
const safeName = path.basename(lesson.filename)
if (safeName !== lesson.filename) throw new Error(`Invalid lesson filename: ...`)
```

There is no test that calls `buildZip` directly with a path-traversal filename to verify this guard fires. The export route tests mock `buildZip` entirely, so they do not exercise this code path. The guard was added for a specific security reason — it deserves a test that proves it works.

## Findings

**Location:** `src/lib/export.ts:42-43`

The guard is reachable only if `buildZip` is called with a filename that was not validated by `GeneratedLessonSchema` (since the Zod regex already blocks path separators). To test it, a unit test must call `buildZip` directly — bypassing the Zod gate — with a traversal filename.

There is no `src/__tests__/export.test.ts` or similar file.

## Proposed Solutions

### Option A: Add `src/__tests__/export.test.ts` with a direct `buildZip` test
```ts
import { buildZip } from '@/lib/export'

// mock server-only
vi.mock('server-only', () => ({}))

it('throws on a path-traversal filename', async () => {
  const lesson = {
    lessonNumber: 1, title: 'T', subjectLine: 'S', previewText: 'P',
    markdownBody: '# M', keyTakeaway: 'K',
    filename: '../outside.md',  // bypasses Zod — tests the internal guard
  }
  await expect(buildZip([lesson as any], 'Title', 'Desc')).rejects.toThrow('Invalid lesson filename')
})
```
- Tests the guard at the library level, independent of the route
- Pros: Proves the defense works; documents the invariant
- Cons: Requires a `lesson as any` cast to bypass TypeScript's type check

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** New file `src/__tests__/export.test.ts`
- **Effort:** Small

## Acceptance Criteria

- [ ] A test calls `buildZip` directly with `filename: '../outside.md'` and asserts it throws
- [ ] A test calls `buildZip` with a valid filename and asserts it resolves

## Work Log

- 2026-04-16: Identified by TypeScript reviewer during code review of `fix/export-todos-117-125`
