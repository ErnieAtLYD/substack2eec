---
status: pending
priority: p1
issue_id: "126"
tags: [code-review, correctness, pipeline-contract, zod]
dependencies: [117]
---

# `parseLessonMarkdown` Produces Filenames That Fail `GeneratedLessonSchema` — Silent 400 on Export

## Problem Statement

`parseLessonMarkdown` in `src/lib/ai.ts` constructs lesson filenames by appending a `safeSlug` to a prefix without stripping trailing hyphens from `safeSlug`. The new `GeneratedLessonSchema.filename` regex requires the stem to end with an alphanumeric character. When a Substack slug hits the 40-char truncation boundary mid-hyphen, the generated filename ends with `-` before `.md` — failing the schema.

This is a broken producer/consumer contract: `parseLessonMarkdown` can emit values that the export route rejects with 400. The user sees a silent "Invalid request" error with no indication of which lesson filename is malformed.

## Findings

**Location:** `src/lib/ai.ts:440-441`

```ts
const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').slice(0, 40)
const filename = `lesson-${String(lessonNum).padStart(2, '0')}-${safeSlug}.md`
```

If `slug = "why-this-works-in-practice-long-version-with-context"` (52 chars), after replace it is unchanged. After `.slice(0, 40)` it becomes `"why-this-works-in-practice-long-version"` — ends in `t`, fine. But if the slug ends at a hyphen boundary: e.g. `slug = "a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-rs-t"` → after slice `"a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-rs-"` ends in `-`. Filename becomes `lesson-01-a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-rs-.md` — **fails** `GeneratedLessonSchema` regex `/^[a-z0-9][a-z0-9-]*[a-z0-9]\.md$/`.

Additionally, `CuratedLessonSchema.slug` is validated as `/^[a-z0-9][a-z0-9-]*$/` — only a leading-alphanumeric guard, no trailing guard — so trailing-hyphen slugs from the AI pass curation validation but break export.

**Flagged by:** TypeScript reviewer, Security sentinel, Agent-native reviewer (independently)

## Proposed Solutions

### Option A: Strip trailing hyphens from `safeSlug` after slice (Recommended)
```ts
const safeSlug = slug
  .replace(/[^a-z0-9-]/g, '-')
  .slice(0, 40)
  .replace(/^-|-$/g, '') || 'lesson'
const filename = `lesson-${String(lessonNum).padStart(2, '0')}-${safeSlug}.md`
```
- Mirrors the exact fix applied to `safeTitle` in the export route
- `|| 'lesson'` fallback handles the degenerate all-hyphen slug case
- Pros: Direct fix at the source, consistent with established pattern in this PR
- Cons: None

### Option B: Validate `parseLessonMarkdown` output against `GeneratedLessonSchema`
```ts
const lesson = { lessonNumber, title, ..., filename }
return GeneratedLessonSchema.parse(lesson)  // throws on bad filename
```
- Fails fast at AI output time rather than at export time
- Pros: Catches all schema violations, not just filename
- Cons: Turns a downstream 400 into a curate-pipeline 500; requires error handling

### Option C: Add trailing-hyphen guard to `CuratedLessonSchema.slug`
```ts
slug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).max(100)
```
- Prevents the AI from producing trailing-hyphen slugs at the curation stage
- Cons: Single-char slugs also rejected; misses the `.slice(0, 40)` truncation case

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/lib/ai.ts:440-441`
- **Effort:** Small
- **Known Pattern:** Same strip-after-slice fix applied to `safeTitle` in `src/app/api/export/route.ts:31-35`

## Acceptance Criteria

- [ ] A slug of 40+ characters ending mid-hyphen produces a valid filename (ends with alphanumeric)
- [ ] `parseLessonMarkdown` output always passes `GeneratedLessonSchema.parse()` without throwing
- [ ] Test added: `parseLessonMarkdown` with a slug that truncates at a hyphen boundary

## Work Log

- 2026-04-16: Identified by TypeScript reviewer, Security sentinel, Agent-native reviewer during code review of `fix/export-todos-117-125`
