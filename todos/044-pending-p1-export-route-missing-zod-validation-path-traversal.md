---
status: pending
priority: p1
issue_id: "044"
tags: [code-review, security, zod, path-traversal]
dependencies: []
---

# `/api/export/route.ts` Accepts Unvalidated Request Body — Path Traversal via `filename`

## Problem Statement

`/api/export/route.ts` casts `request.json()` directly to `ExportRequest` with no runtime validation. A malicious caller can submit a crafted `lessons` array with arbitrary `filename` values (e.g. `../../etc/passwd`), bypassing the sanitization that `parseLessonMarkdown` applies at generation time. The export route was not updated with Zod validation when `/api/curate` was hardened (todo 038).

## Findings

**Location:** `src/app/api/export/route.ts:6`

```typescript
const body: ExportRequest = await request.json()
```

This is a TypeScript lie — `request.json()` returns `unknown` at runtime. The only guard is:
```typescript
if (!body.lessons || body.lessons.length === 0) { ... }
```
…which does not validate lesson object shapes.

`lesson.filename` goes directly into `zip.file(lesson.filename, lesson.markdownBody)`. A direct API call with:
```json
{ "lessons": [{ "filename": "../../attack.md", "markdownBody": "pwned" }] }
```
would write outside the intended ZIP structure.

## Proposed Solutions

### Option A: Add Zod schema to export route (Recommended)
```typescript
import { z } from 'zod'

const ExportRequestSchema = z.object({
  lessons: z.array(z.object({
    lessonNumber: z.number(),
    title: z.string().max(500),
    subjectLine: z.string().max(50),
    previewText: z.string().max(90),
    markdownBody: z.string().max(50_000),
    keyTakeaway: z.string().max(500),
    filename: z.string().regex(/^[a-z0-9][a-z0-9-]*\.md$/).max(80),
  })).min(1).max(50),
  courseTitle: z.string().max(200),
  courseDescription: z.string().max(1000),
})
```

Apply the same `safeParse` pattern as the curate route — return 400 on failure.

- **Pros:** Closes path traversal, enforces filename format, consistent with curate route
- **Effort:** Small
- **Risk:** None

### Option B: Sanitize filename before passing to zip
```typescript
const safeFilename = lesson.filename.replace(/[^a-z0-9-]/g, '-').slice(0, 80) + '.md'
zip.file(safeFilename, lesson.markdownBody)
```
- **Pros:** Minimal change
- **Cons:** Doesn't validate other fields; still accepts arbitrarily large payloads

## Recommended Action

Option A. The pattern is already established in the curate route — copy and adapt it. The `filename` regex `^[a-z0-9][a-z0-9-]*\.md$` is the same constraint already applied by `parseLessonMarkdown`.

## Technical Details

**Affected file:** `src/app/api/export/route.ts`

## Acceptance Criteria

- [ ] Zod schema added to export route covering all `GeneratedLesson` fields
- [ ] `filename` field validated with regex `^[a-z0-9][a-z0-9-]*\.md$`
- [ ] Invalid requests return 400 before any ZIP operations
- [ ] `courseTitle` and `courseDescription` validated with `.max()` in schema (redundant with the existing `slice` guards but makes the contract explicit)

## Work Log

- 2026-03-29: Found during security review of batch fixes (round 2)

## Resources

- `src/app/api/curate/route.ts` — established Zod pattern to follow
- `src/lib/export.ts` — `buildZip` call site
