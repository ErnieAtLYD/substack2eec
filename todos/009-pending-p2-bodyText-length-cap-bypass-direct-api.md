---
status: done
priority: p2
issue_id: "009"
tags: [code-review, security, api-validation]
dependencies: []
---

# Missing `bodyText` Length Cap on Direct POST to `/api/curate` — Bypasses Fetch-Route Truncation

## Problem Statement

`MAX_POST_WORDS = 2500` truncation runs during `extractTextFromHtml` in `substack.ts`, which is only called via `/api/fetch-posts`. A client that bypasses `/api/fetch-posts` and POSTs directly to `/api/curate` with crafted `bodyText` values can supply arbitrarily long content — up to 50 posts (the new cap) each with unlimited `bodyText`. This dramatically amplifies per-request token cost and processing time.

**Example attack:**
```bash
curl -X POST /api/curate \
  -H 'Content-Type: application/json' \
  -d '{"posts": [{"bodyText": "x".repeat(500000), ...}, ...], "lessonCount": 10}'
```

Each `rewriteAsLesson` call receives that full `bodyText` and adds it to the Claude context window.

## Findings

**Location:** `src/app/api/curate/route.ts:14-26` — posts array validation

The existing checks:
1. `body.posts.length === 0` — catches empty array ✓
2. `body.posts.length > 50` — caps array length ✓
3. No per-post field validation — bodyText, title, etc. are unbounded ✗

**Also affected:** `src/lib/ai.ts` — `formatPostsForCuration` receives unbounded `excerpt`, and `rewriteAsLesson` receives unbounded `bodyText` directly into the AI prompt.

## Proposed Solutions

### Option A: Truncate `bodyText` at the route boundary (Recommended)
Before passing posts to any AI function, truncate `bodyText` to match the fetch-route limit:
```typescript
const MAX_BODY_CHARS = 15000  // ~2500 words of English text

const safePosts = body.posts.map(p => ({
  ...p,
  bodyText: typeof p.bodyText === 'string' ? p.bodyText.slice(0, MAX_BODY_CHARS) : '',
  title: typeof p.title === 'string' ? p.title.slice(0, 500) : '',
  excerpt: typeof p.excerpt === 'string' ? p.excerpt.slice(0, 500) : '',
}))
```
Then use `safePosts` instead of `body.posts` in the stream handler.
- **Pros:** Closes the bypass, mirrors fetch-route behavior, no behavior change for valid inputs
- **Effort:** Small
- **Risk:** None

### Option B: Add a Zod schema for per-post field validation
Validate each post field with length constraints before processing:
```typescript
const PostSchema = z.object({
  slug: z.string().max(200),
  title: z.string().max(500),
  subtitle: z.string().max(500).nullable(),
  excerpt: z.string().max(500),
  bodyText: z.string().max(15000),
  publishedAt: z.string(),
  wordCount: z.number(),
  audience: z.enum(['everyone', 'paid']),
})
```
- **Pros:** Explicit contract, type-safe, rejects bad input with 400
- **Cons:** Adds `zod` dependency (not currently in package.json)
- **Effort:** Medium
- **Risk:** Low

## Recommended Action

Option A — simple truncation at the route boundary. No new dependencies, mirrors the existing fetch-route behavior, and is consistent with the project's current validation style (manual checks, not Zod). Adding Zod can be a future improvement.

## Technical Details

**Affected file:** `src/app/api/curate/route.ts` — after the `posts.length > 50` check

## Acceptance Criteria

- [ ] Direct POST to `/api/curate` with `bodyText` of 500,000 chars is truncated to ~15,000 chars before hitting AI functions
- [ ] Normal posts (bodyText ≤ 15,000 chars) are unaffected
- [ ] The `MAX_BODY_CHARS` constant mirrors the `MAX_POST_WORDS` logic in `substack.ts`

## Work Log

- 2026-03-18: Found during security fix review of feat/custom-course-length

## Resources

- Security reviewer finding: "P2-C Missing `bodyText` cap on direct POST to `/api/curate`"
