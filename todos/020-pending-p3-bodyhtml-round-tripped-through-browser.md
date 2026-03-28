---
status: pending
priority: p3
issue_id: "020"
tags: [code-review, security, api-design]
dependencies: ["011"]
---

# Raw `bodyHtml` Round-Tripped Through Browser — Client Can Substitute Arbitrary HTML

## Problem Statement

`/api/fetch-posts` sends the full `bodyHtml` of each Substack post to the browser. The client then echoes the entire `posts` array — including `bodyHtml` — back to `/api/curate`. This means a malicious or automated client can substitute arbitrary HTML in place of what was fetched from Substack, bypassing the URL validation entirely and feeding crafted content into the AI pipeline.

**Why it matters:** The server cannot distinguish between authentic Substack HTML and attacker-supplied HTML at the curate stage. `bodyHtml` is also a large payload that inflates the client-server round-trip unnecessarily.

## Findings

**Location:**
- `src/app/api/fetch-posts/route.ts` line 38 — returns `bodyHtml` to client
- `src/components/features/ReviewForm.tsx` line 113+ — stores and re-sends `posts` including `bodyHtml`
- `src/app/api/curate/route.ts` — accepts `bodyHtml` from client body without re-validation
- `src/types/index.ts` line 6 — `bodyHtml` is part of `SubstackPost` type

## Proposed Solutions

### Option A — Strip `bodyHtml` from fetch-posts response (Recommended)

Return only `bodyText` (already extracted server-side). Have `/api/curate` accept posts with `bodyText` only — no raw HTML from client.

- **Pros:** Eliminates the attack surface entirely; reduces payload size
- **Cons:** Changes the `SubstackPost` type contract
- **Effort:** Medium | **Risk:** Low

### Option B — Server-side caching of fetched posts

Cache `posts` server-side keyed by URL+session. `/api/curate` looks up posts from the cache rather than accepting them from the client body.
- **Pros:** Client cannot tamper with post content at all
- **Cons:** Requires a cache backend (Redis or in-memory with TTL)
- **Effort:** Large | **Risk:** Medium

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `src/app/api/fetch-posts/route.ts`, `src/app/api/curate/route.ts`, `src/types/index.ts`

## Acceptance Criteria

- [ ] `bodyHtml` is not included in the `/api/fetch-posts` JSON response to the browser
- [ ] `/api/curate` does not accept or process raw HTML from the client request body

## Work Log

- 2026-03-27: Surfaced by security-sentinel agent during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
