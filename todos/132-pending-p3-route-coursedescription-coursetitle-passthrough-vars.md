---
status: pending
priority: p3
issue_id: "132"
tags: [code-review, simplicity, dead-code]
dependencies: []
---

# Passthrough Variable Aliases for `courseTitle`/`courseDescription` in Export Route

## Problem Statement

`src/app/api/export/route.ts` introduces two variables that are simple aliases for fields on `body`:

```ts
const courseTitle = body.courseTitle
const courseDescription = body.courseDescription
```

These are used once each (in the `buildZip` call) and provide no additional clarity over accessing `body.courseTitle` and `body.courseDescription` directly. They add 2 lines of indirection without semantic value.

## Findings

**Location:** `src/app/api/export/route.ts:19-20`

```ts
const courseTitle = body.courseTitle
const courseDescription = body.courseDescription
```

Both are used in exactly one place each:
- Line 24: `buildZip(body.lessons, courseTitle, courseDescription)`

The `safeTitle` computation also reads `courseTitle` (line 31), making the alias span two uses. `body.courseTitle` is equally readable.

## Proposed Solutions

### Option A: Inline directly
```ts
zipBuffer = await buildZip(body.lessons, body.courseTitle, body.courseDescription)
...
const safeTitle = (body.courseTitle
  .toLowerCase()
  ...
```
- Pros: -2 lines, no semantic loss
- Cons: `body.courseTitle` is slightly more verbose than `courseTitle` in the `safeTitle` chain

### Option B: Keep one alias for `courseTitle` (used twice), remove `courseDescription` alias (used once)
```ts
const courseTitle = body.courseTitle  // used in buildZip and safeTitle
// use body.courseDescription directly in buildZip call
```
- Partial improvement

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/app/api/export/route.ts:19-20`
- **Effort:** Trivial

## Work Log

- 2026-04-16: Identified by code simplicity reviewer during code review of `fix/export-todos-117-125`
