---
module: src/lib/ai.ts
problem_type: logic-errors
symptoms:
  - "parseLessonMarkdown generates filenames with a trailing hyphen before .md (e.g., lesson-01-some-slug-.md)"
  - "GeneratedLessonSchema.filename regex validation rejects the malformed filename at export time"
  - "POST /api/export returns a silent 400 with { error: 'Invalid request' } — no field name in the error"
  - "Failure is intermittent and slug-dependent — only triggers when a slug truncates exactly on a hyphen"
tags:
  - filename-sanitization
  - slug-truncation
  - trailing-hyphen
  - GeneratedLessonSchema
  - parseLessonMarkdown
  - export-route
  - zod-validation
  - strip-after-slice
  - regex
severity: high
date: 2026-04-16
---

# `parseLessonMarkdown` Slug Truncation Produces Trailing-Hyphen Filename

## Symptoms

`POST /api/export` returns `{ error: 'Invalid request' }` with HTTP 400 when a lesson's filename contains a trailing hyphen before `.md`. The error message gives no field name, making it hard to trace. The offending filename looks like:

```
lesson-01-a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-rs-.md
```

This only manifests for Substack posts whose slugs happen to truncate at a hyphen boundary after 40 characters — an intermittent, slug-dependent failure. The curate pipeline (`POST /api/curate`) completes successfully and emits `lesson_done` SSE events with the malformed filename; the error only surfaces later when calling export.

## Root Cause

`parseLessonMarkdown` in `src/lib/ai.ts:440` sanitized a Substack slug into a safe filename segment:

```ts
const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').slice(0, 40)
const filename = `lesson-${String(lessonNum).padStart(2, '0')}-${safeSlug}.md`
```

The `.slice(0, 40)` ran **before** any trailing-hyphen stripping. If the 40th character of the replaced string was a `-`, the truncated result carried that hyphen into the filename:

```
slug after replace: "a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-rs-t"
                     ^---------40 chars---------^
after .slice(0,40): "a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-rs-"  ← trailing hyphen
filename:           "lesson-01-a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-rs-.md"
```

`GeneratedLessonSchema.filename` enforces `/^[a-z0-9][a-z0-9-]*[a-z0-9]\.md$/`, which requires alphanumeric characters at both ends. The trailing hyphen violates this, and Zod rejects the entire export payload.

The analogous `safeTitle` computation in `src/app/api/export/route.ts` had the same bug and was fixed first (strip after slice). The fix was not applied to `parseLessonMarkdown`, creating a partial repair.

## Solution

In `src/lib/ai.ts` at line 440, add strip-after-slice:

```ts
// Before
const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').slice(0, 40)

// After
// strip after slice so truncation at a hyphen boundary doesn't produce a trailing-hyphen filename
const safeSlug = (slug.replace(/[^a-z0-9-]/g, '-').slice(0, 40).replace(/^-+|-+$/g, '')) || 'lesson'
```

The `|| 'lesson'` fallback handles the degenerate case of an all-hyphen slug (e.g., a slug composed entirely of special characters), yielding a valid filename like `lesson-01-lesson.md`.

## Why the `+` Quantifier Matters

Using `/^-+|-+$/g` (with `+`) rather than `/^-|-$/g` (without `+`) ensures **all** consecutive leading or trailing hyphens are stripped in a single pass:

```
input:              "---"
/^-|-$/g result:    "-"   ← only one stripped per side, still invalid
/^-+|-+$/g result:  ""    ← entire run consumed, || 'lesson' fires → "lesson"
```

Without `+`, a slug like `some-post!!!` (whose `!!!` maps to `---`) would become `some-post-` after replace, then `some-post` after `.replace(/^-|-$/g, '')` — fine here. But `---abc---` would become `--abc--` (one stripped per side) — still invalid. With `+`, it correctly becomes `abc`.

## The Strip-After-Slice Pattern

**ORDER IS LOAD-BEARING** — always: replace → truncate → strip edges.

```ts
function toFilenameSlug(title: string, maxLen = 40): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // 1. normalize
    .slice(0, maxLen)             // 2. truncate
    .replace(/^-+|-+$/g, '');    // 3. strip edges — MUST come after truncation
}
```

Never reverse steps 2 and 3. Step 2 exposes a new trailing edge; step 3 must see that edge to remove it. This pattern is now used in both:
- `src/lib/ai.ts:440` — `safeSlug` for lesson filenames
- `src/app/api/export/route.ts:31-35` — `safeTitle` for the ZIP Content-Disposition filename

## Prevention

**1. Single slug utility, single place.** All slug/filename normalization should go through one shared function. Duplicating the pattern across `ai.ts`, `export.ts`, etc. is the direct cause of partial fixes — one site gets patched, others are missed.

**2. Test producers against the schema directly.** Any code that produces a `GeneratedLesson.filename` must be tested by passing its output through `GeneratedLessonSchema.parse()`. Don't rely on visual inspection of the regex.

**3. Review checklist:** When a PR changes a Zod schema constraint (especially regex-based), grep for all producers of that field and verify they can still produce valid output. Run the `learnings-researcher` agent against the changed schema to surface related past issues.

**4. Surface failing fields in 400 responses.** The bug reached production silently because `ExportRequestSchema.safeParse` failure returned `{ error: 'Invalid request' }` with no field details. Consider logging `parsed.error.flatten()` server-side to make schema mismatches traceable without a debugger.

## Tests Added

Four regression tests in `src/__tests__/ai-filename.test.ts`:

1. **Truncation exactly on a hyphen** — slug with hyphen at position 40; verifies filename ends alphanumerically and passes `GeneratedLessonSchema.parse()`
2. **Consecutive trailing hyphens** — slug ending with `!!!` (maps to `---`); verifies all are stripped
3. **All-hyphen slug** — input `'---'`; verifies fallback produces `lesson-01-lesson.md`
4. **Normal slug** — short slug with no boundary issues; verifies happy path is unchanged

## Related Documentation

- [`docs/solutions/logic-errors/zod-schema-tightening-broke-pipeline-contract.md`](./zod-schema-tightening-broke-pipeline-contract.md) — Direct predecessor: documents how tightening a Zod schema constraint (`courseTitle: .min(1)`) broke the pipeline contract when the AI produced an empty string. Establishes the principle of **defensive normalization at AI-output boundaries**. The strip-after-slice fix here is the same class of boundary normalization.

- [`docs/solutions/architecture-issues/zod-schema-ts-interface-drift.md`](../architecture-issues/zod-schema-ts-interface-drift.md) — Establishes the Zod-first / `z.infer<>` single-source-of-truth pattern for `src/types/index.ts`. Relevant because `GeneratedLessonSchema.filename` (the tightened regex) lives there and any change to it is a schema-contract change affecting both producer and consumer.

- [`docs/solutions/architecture-issues/zod-omit-vs-pick-subset-schema-allowlist.md`](../architecture-issues/zod-omit-vs-pick-subset-schema-allowlist.md) — Related schema-composition safety pattern; background context on how subset schemas are derived from shared parent schemas in this codebase.
