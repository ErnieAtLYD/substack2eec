---
status: pending
priority: p1
issue_id: "076"
tags: [code-review, security, validation, memory]
dependencies: []
---

# `bodyHtml` Accepted With No Size Cap — Memory Exhaustion Vector

## Problem Statement

Both route schemas accept `bodyHtml: z.string()` with no `.max()` constraint. A single post's `bodyHtml` can be arbitrarily large. The pipeline only truncates `bodyText` (to `MAX_BODY_CHARS = 15_000`), but `bodyHtml` is never truncated or capped.

`bodyHtml` is stored in the in-memory `posts` array for the entire request lifetime, then passed downstream into `buildZip` etc. At 50 posts × e.g. 10 MB HTML each = 500 MB held per concurrent request. Combined with the rate limiter being bypassable via IP spoofing (see todo 084), this is a workable DoS via memory exhaustion on the Node.js server.

## Findings

- `src/app/api/curate/route.ts:35` — `bodyHtml: z.string()` (no max)
- `src/app/api/propose-courses/route.ts:20` — `bodyHtml: z.string()` (no max)
- `bodyText` is capped: `curate/route.ts:55`, `propose-courses/route.ts:39`
- `bodyHtml` is never passed to AI calls but is held in memory and passed to export

**Source:** Security sentinel review

## Proposed Solutions

### Option A — Add `.max()` constraint (Recommended)
Add `z.string().max(500_000)` to `bodyHtml` in both schemas. At ~6 chars/word and `MAX_POST_WORDS = 2500`, max expected bodyHtml per post is ~60,000 chars. 500,000 gives 8× headroom.

**Pros:** Eliminates memory exhaustion at validation layer. Simple one-line change per file.
**Cons:** None.
**Effort:** Small
**Risk:** None

### Option B — Truncate bodyHtml same as bodyText
Add `.slice(0, MAX_BODY_CHARS)` to bodyHtml in the post mapping transform (alongside the existing bodyText truncation).

**Pros:** Defense-in-depth even if Zod validation is bypassed.
**Cons:** Less clean than schema-level rejection; still processes oversized input.
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A + Option B: both schema-level max and truncation in the transform.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts:35` and the posts mapping transform
- `src/app/api/propose-courses/route.ts:20` and the posts mapping transform

## Acceptance Criteria

- [ ] `bodyHtml` has a `.max(500_000)` (or similar) constraint in both route schemas
- [ ] A request with bodyHtml > cap is rejected with 400

## Work Log

- 2026-04-04: Found by security sentinel code review
