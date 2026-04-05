---
status: pending
priority: p2
issue_id: "080"
tags: [code-review, simplicity, duplication, typescript]
dependencies: []
---

# Posts Array Zod Schema Duplicated in Both Route Files — No Shared Source

## Problem Statement

The `posts` array Zod schema is copy-pasted verbatim in two places:

- `src/app/api/curate/route.ts:27–37`
- `src/app/api/propose-courses/route.ts:11–23`

If `SubstackPost` gains a field, it must be updated in two places. The `SubstackPost` interface in `src/types/index.ts` is the canonical definition; the Zod schema should live alongside it as `SubstackPostSchema` and be imported by both routes.

Also duplicated: `MAX_BODY_CHARS = 15_000` is defined in both route files (line 9 each).

## Findings

- `src/app/api/curate/route.ts:9,27–37` — `MAX_BODY_CHARS` and posts schema
- `src/app/api/propose-courses/route.ts:9,11–23` — same definitions
- `src/types/index.ts` — `SubstackPost` interface exists but no Zod schema counterpart

**Source:** TypeScript reviewer, simplicity reviewer

## Proposed Solutions

### Option A — Export shared schema from `src/types/index.ts` (Recommended)
Add `SubstackPostSchema` and `MAX_BODY_CHARS` export to `src/types/index.ts`. Import in both routes.

**Pros:** Single source of truth. Matches CLAUDE.md convention that types live in `src/types/index.ts`.
**Cons:** Mixes Zod (runtime) with TypeScript (compile-time) in the types file. Some prefer keeping Zod in a `src/lib/schemas.ts`.
**Effort:** Small
**Risk:** None

### Option B — Extract to `src/lib/schemas.ts`
New file with all shared Zod schemas. Import from there in routes.

**Pros:** Cleaner separation of concerns.
**Cons:** New file to maintain; adds a layer.
**Effort:** Small
**Risk:** None

## Recommended Action

Option A — add `SubstackPostSchema` and `MAX_BODY_CHARS` to `src/types/index.ts`.

## Technical Details

**Affected files:**
- `src/types/index.ts` (add schema + constant)
- `src/app/api/curate/route.ts` (remove local definitions, import shared)
- `src/app/api/propose-courses/route.ts` (same)

## Acceptance Criteria

- [ ] One canonical `SubstackPostSchema` imported by both routes
- [ ] `MAX_BODY_CHARS` defined once, imported in both routes
- [ ] No schema drift between the two routes' post validation

## Work Log

- 2026-04-04: Found by TypeScript and simplicity reviewers
