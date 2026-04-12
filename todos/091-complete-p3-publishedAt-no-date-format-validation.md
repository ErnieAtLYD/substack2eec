---
status: pending
priority: p3
issue_id: "091"
tags: [code-review, security, validation]
dependencies: []
---

# `publishedAt` Accepts Free-Form String — No Date Format Validation

## Problem Statement

Both route schemas accept `publishedAt: z.string()` with no format constraint. This field is embedded in the curation prompt at `ai.ts:94`:

```ts
`    published: ${sanitizeForPrompt(p.publishedAt).slice(0, 10)}`,
```

The `sanitizeForPrompt` + `.slice(0, 10)` chain neutralizes current injection attempts (newline → space, then truncated to 10 chars). However, the field is stored unvalidated in the posts array, and any future code path that uses `publishedAt` without this two-step protection would reopen an injection surface.

## Findings

- `src/app/api/curate/route.ts:31` — `publishedAt: z.string()`
- `src/app/api/propose-courses/route.ts:16` — `publishedAt: z.string()`
- `src/lib/ai.ts:94` — embedded in prompt with sanitize+slice

**Source:** Security sentinel review

## Proposed Solutions

### Option A — Add regex constraint (Recommended)
```ts
publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/)
```
Or use `z.string().datetime()` if ISO 8601 timestamps are expected.

**Effort:** Trivial | **Risk:** None

### Option B — Use `z.string().date()` (Zod 3.22+)
Validates YYYY-MM-DD format natively.

**Effort:** Trivial | **Risk:** None — check Zod version first

## Recommended Action

Option A — regex constraint in both schemas.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts:31`
- `src/app/api/propose-courses/route.ts:16`

## Acceptance Criteria

- [ ] `publishedAt` validated to date-like format in both schemas

## Work Log

- 2026-04-04: Found by security sentinel
