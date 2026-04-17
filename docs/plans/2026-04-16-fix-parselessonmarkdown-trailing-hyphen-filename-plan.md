---
title: "fix: parseLessonMarkdown safeSlug trailing-hyphen filename breaks export"
type: fix
status: completed
date: 2026-04-16
---

# fix: `parseLessonMarkdown` Trailing-Hyphen Filename Breaks Export Pipeline

## Problem Statement

`parseLessonMarkdown` in `src/lib/ai.ts:440` constructs lesson filenames by appending a `safeSlug` to a `lesson-NN-` prefix. The `safeSlug` is built by sanitizing the Substack post slug and slicing to 40 characters — but trailing hyphens introduced by the slice are not stripped.

The new `GeneratedLessonSchema.filename` regex (`/^[a-z0-9][a-z0-9-]*[a-z0-9]\.md$/`) requires the stem to end with an alphanumeric character. When a slug has a hyphen at or near the 40-character boundary, `safeSlug` ends with `-`, producing a filename like `lesson-01-some-slug-.md` — which fails the schema regex.

Result: the curate pipeline (`POST /api/curate`) emits a `lesson_done` SSE event with a malformed filename. When the client then calls `POST /api/export` with those lessons, `ExportRequestSchema.safeParse` rejects the request with `{ error: 'Invalid request' }` and status 400 — no indication of which field failed or why.

This was flagged by 3 independent review agents (TypeScript, Security, Agent-native).

## Root Cause

`src/lib/ai.ts:440`:
```ts
const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').slice(0, 40)
//                                                              ↑ no strip after slice
const filename = `lesson-${String(lessonNum).padStart(2, '0')}-${safeSlug}.md`
```

The `.slice(0, 40)` truncation can leave a trailing `-` if the slug has a hyphen at position 40. There is no `.replace(/^-+|-+$/g, '')` after the slice — unlike the analogous `safeTitle` computation in `src/app/api/export/route.ts:30-35`, which was recently fixed with exactly this strip-after-slice pattern.

## Proposed Solution

Apply the same strip-after-slice pattern already established in the export route.

### Change 1: Fix `parseLessonMarkdown` in `src/lib/ai.ts:440`

**Before:**
```ts
const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').slice(0, 40)
```

**After:**
```ts
const safeSlug = (slug.replace(/[^a-z0-9-]/g, '-').slice(0, 40).replace(/^-+|-+$/g, '')) || 'lesson'
```

- `.replace(/^-+|-+$/g, '')` strips all leading/trailing hyphens introduced by the slice (`+` is load-bearing — without it, consecutive hyphens at the boundary survive one replace pass)
- `|| 'lesson'` fallback guards the degenerate case where the slug is entirely non-alphanumeric (produces empty string after stripping)
- Mirrors the pattern in `src/app/api/export/route.ts:31-35` (the `safeTitle` fix from this same PR)

### Change 2 (Defense-in-depth, optional): Tighten `CuratedLessonSchema.slug`

`src/types/index.ts:16` currently:
```ts
slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(100),
```

Adding a trailing-alphanumeric guard prevents trailing-hyphen slugs from entering the pipeline at the curation stage:
```ts
slug: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/).max(100),
```

The `?` makes the middle group optional, allowing single-character slugs (`a`). Note: this does **not** eliminate the need for Change 1, because `.slice(0, 40)` can still produce trailing hyphens from valid (non-trailing-hyphen) slugs longer than 40 chars. If applying Change 2, also apply it to `SubstackPostSchema.slug` at `src/types/index.ts:33`, which uses the same permissive pattern.

### Change 3: Add regression test for `parseLessonMarkdown`

New file: `src/__tests__/ai-filename.test.ts`

There are currently no tests for `parseLessonMarkdown`. The test should cover:
- A slug with a hyphen at exactly position 40 → filename ends alphanumerically, passes `GeneratedLessonSchema.parse`
- A slug with multiple consecutive trailing hyphens (`a---`) → all stripped
- An all-hyphen slug (`---`) → fallback to `lesson`
- A normal slug (short, no boundary issues) → filename unchanged and valid

## Technical Details

| File | Lines | Change |
|---|---|---|
| `src/lib/ai.ts` | 440 | Strip trailing hyphens after slice |
| `src/types/index.ts` | 16 | (Optional) tighten slug regex |
| `src/__tests__/ai-filename.test.ts` | new | Regression tests |

**Established pattern reference:** `src/app/api/export/route.ts:30-35` — identical strip-after-slice already applied to `safeTitle`.

**Known institutional pattern:** `docs/solutions/logic-errors/zod-schema-tightening-broke-pipeline-contract.md` — "defensive normalization beats upstream enforcement."

## Acceptance Criteria

- [x] A slug of 40+ characters with a hyphen at the truncation boundary produces a filename ending with an alphanumeric character
- [x] A slug producing multiple consecutive trailing hyphens after slice has all of them stripped
- [x] An all-hyphen slug produces `lesson-NN-lesson.md` (fallback)
- [x] `parseLessonMarkdown` output always satisfies `GeneratedLessonSchema.parse()` without throwing
- [x] New test: `src/__tests__/ai-filename.test.ts` covers all boundary cases above
- [x] `npm test` passes

## Out of Scope

- Todo 127 (consecutive interior hyphens in filename regex) — separate issue
- Todo 128 (`lessonNumber` integer constraints) — separate issue
- Todo 129/130 (`ExportRequest` interface cleanup) — separate issue

## Sources & References

- Todo: `todos/126-pending-p1-parselessonmarkdown-trailing-hyphen-breaks-export.md`
- Established pattern: `src/app/api/export/route.ts:30-35` (safeTitle strip-after-slice)
- Institutional learning: `docs/solutions/logic-errors/zod-schema-tightening-broke-pipeline-contract.md`
- Schema constraint: `src/types/index.ts:53` (`GeneratedLessonSchema.filename` regex)
- Producer: `src/lib/ai.ts:440-441` (`parseLessonMarkdown` safeSlug construction)
