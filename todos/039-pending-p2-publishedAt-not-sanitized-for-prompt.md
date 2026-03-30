---
status: done
priority: p2
issue_id: "039"
tags: [code-review, security, prompt-injection]
dependencies: []
---

# `p.publishedAt` Not Sanitized in `formatPostsForCuration` — Inconsistent With PR Fix

## Problem Statement

PR #4 applied `sanitizeForPrompt` to `slug`, `title`, `subtitle`, and `excerpt` in `formatPostsForCuration`. The `publishedAt` field was left with only `.slice(0, 10)` — which limits length but does not strip newlines. `publishedAt` is a string from the Substack API. While it is expected to be `YYYY-MM-DD`, there is no runtime guarantee of that shape. A crafted `publishedAt` value containing a newline followed by a fake `[N] slug:` entry could disrupt the curation prompt structure.

## Findings

**Location:** `src/lib/ai.ts:83`

```typescript
`    published: ${p.publishedAt.slice(0, 10)}`,
// No newline collapse — inconsistent with the four fields sanitized in PR #4
```

All five user-controlled string fields in `formatPostsForCuration` should be consistently sanitized. `publishedAt` was missed.

Raised by: kieran-typescript-reviewer.

## Proposed Solutions

### Option A: Apply `sanitizeForPrompt` after the slice (Recommended)
```typescript
`    published: ${sanitizeForPrompt(p.publishedAt.slice(0, 10))}`,
```
Or equivalently, since the slice already limits length to 10 chars:
```typescript
`    published: ${p.publishedAt.slice(0, 10).replace(/[\n\r\t]/g, ' ')}`,
```
- **Pros:** Closes the gap; consistent treatment with all other string fields; `.slice(0, 10)` already limits blast radius so newline collapse is the only missing defense
- **Effort:** Trivial
- **Risk:** None

### Option B: Validate `publishedAt` format at the API boundary with Zod (see todo #038)
Enforce `z.string().regex(/^\d{4}-\d{2}-\d{2}/)` — prevents malformed values from reaching `ai.ts` at all.
- **Pros:** Upstream defense; cleaner than point sanitization
- **Cons:** Requires todo #038 to be done first

## Recommended Action

Option A immediately (one-liner), Option B when todo #038 is implemented. Both together make this field safe by defense-in-depth.

## Technical Details

**Affected file:** `src/lib/ai.ts:83`

## Acceptance Criteria

- [ ] `p.publishedAt` has newline characters stripped before interpolation into the curation prompt
- [ ] `npx tsc --noEmit` passes

## Work Log

- 2026-03-29: Identified during multi-agent review of PR #4 (kieran-typescript-reviewer)
