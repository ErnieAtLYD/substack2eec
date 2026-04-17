---
status: complete
priority: p2
issue_id: "061"
tags: [code-review, zod, security]
dependencies: []
---

# `filename` Regex Allows Single-Character Stems (e.g. `a.md`)

## Problem Statement

The `filename` regex `/^[a-z0-9][a-z0-9-]*\.md$/` requires one leading `[a-z0-9]` and then zero or more `[a-z0-9-]`. The `*` quantifier means the second character class can match zero times, allowing filenames like `a.md`, `1.md`, or `-a.md` (wait, the hyphen is in the middle class). So `a.md` passes — a 1-character stem before `.md`. This is likely unintentional: `parseLessonMarkdown` generates filenames like `lesson-01-slug.md`, which are always much longer.

## Findings

**Location:** `src/app/api/export/route.ts:13`

```typescript
filename: z.string().regex(/^[a-z0-9][a-z0-9-]*\.md$/).max(80),
```

- `a.md` → matches ✓ (probably unintentional)
- `lesson-01-why.md` → matches ✓
- `ab.md` → matches ✓
- `.md` → does not match ✓ (good — enforced by leading `[a-z0-9]`)

The minimum stem length should be at least 2 characters to match what the pipeline actually produces and to close the degenerate single-char case.

## Proposed Solution

Use `+` on the second character class (requires at least one more char after the leading char):
```typescript
filename: z.string().regex(/^[a-z0-9][a-z0-9-]+\.md$/).max(80),
```
This requires at minimum `aa.md` (2-char stem) and aligns with the `lesson-XX-slug.md` format the pipeline generates.

## Technical Details

**Affected file:** `src/app/api/export/route.ts:13`

## Acceptance Criteria

- [ ] `filename` regex uses `+` not `*` for the second character class
- [ ] Single-character stems like `a.md` are rejected

## Work Log

- 2026-03-29: Found during TypeScript and security review of P1 fixes
