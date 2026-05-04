---
status: pending
priority: p2
issue_id: "154"
tags: [code-review, security, dos, validation]
dependencies: []
---

# `/api/curate` Schema Accepts `bodyHtml` (500KB × 50 posts) That It Never Reads

## Problem Statement

`/api/curate` validates against `SubstackPostSchema`, which permits `bodyHtml: z.string().max(500_000)` × `posts.max(50)` = 25 MB JSON body per request. The route never reads `bodyHtml` (it consumes `bodyText`). The propose-courses route correctly `pick`s only the safe fields. The browser client also strips `bodyHtml` before posting (`ReviewForm.tsx:195`).

But because the schema accepts it, an attacker can:
1. Send a 25 MB request body.
2. Force JSON parse + Zod validation to complete.
3. Tie up a serverless function with `maxDuration = 180s` once the LLM call begins.

This is distinct from todo #144 (which tracks the wasted in-memory retention of `bodyHtml` after extraction). #154 is about the request validation surface specifically.

## Findings

**Location:**
- `src/app/api/curate/route.ts:9-13` — uses `SubstackPostSchema` directly
- `src/types/index.ts:35` — `bodyHtml: z.string().max(500_000)`

Flagged by security-sentinel (P2-3).

## Proposed Solutions

### Option A: `SubstackPostSchema.omit({ bodyHtml: true })` at the curate route

```ts
const RequestSchema = z.object({
  posts: z.array(SubstackPostSchema.omit({ bodyHtml: true })).max(50),
  // ...
})
```

- Pros: 50× smaller worst-case body; matches what the route actually consumes.
- Cons: None.
- Effort: Small.

### Option B: `.pick(...)` to the exact fields curate uses

Even tighter — only `slug`, `title`, `subtitle`, `publishedAt`, `excerpt`, `bodyText`, `audience`, `wordCount`.

- Pros: Strictest; documents the contract.
- Cons: Brittle to field additions.
- Effort: Small.

### Option C: Dropping `bodyHtml` from `SubstackPost` entirely (see #144)

Resolves both this and #144 at once.

## Recommended Action

_Pending triage._ Coordinate with #144. If #144 lands, this becomes moot.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts`
- `src/types/index.ts` (only if going Option C)

## Acceptance Criteria

- [ ] A 25 MB request to `/api/curate` is rejected at validation
- [ ] Field strip is consistent across `/api/curate` and `/api/propose-courses`

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- `todos/144-pending-p3-substackpost-bodyhtml-retention-after-extraction.md` (related, addresses retention not validation)
