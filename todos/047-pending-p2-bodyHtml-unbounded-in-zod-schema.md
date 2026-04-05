---
status: pending
priority: p2
issue_id: "047"
tags: [code-review, security, zod, dos]
dependencies: []
---

# `bodyHtml` Has No `.max()` Bound in `CurateRequestSchema` — Memory DoS Vector

## Problem Statement

`CurateRequestSchema` accepts `bodyHtml: z.string()` with no length limit. A malicious caller can submit 50 posts each with megabytes of `bodyHtml`, causing the server to deserialize and hold hundreds of megabytes in memory for the 180-second lifetime of the streaming request. `bodyText` has a 15K runtime cap, but `bodyHtml` has no cap at any layer.

## Findings

**Location:** `src/app/api/curate/route.ts:19`

```typescript
bodyHtml: z.string(),   // no .max() — unbounded
bodyText: z.string(),   // capped post-parse to MAX_BODY_CHARS=15_000
```

`bodyHtml` is not used in any AI prompt (only `bodyText` is interpolated), but it is spread onto the post object and carried in memory across the full request. With 50 posts × large HTML, this is a memory-based DoS surface.

Typical Substack HTML is 5,000–50,000 chars. A ceiling of 100,000 chars is generous and blocks abuse.

## Proposed Solutions

### Option A: Add `.max()` to both `bodyHtml` and `bodyText` in schema (Recommended)
```typescript
bodyHtml: z.string().max(100_000),
bodyText: z.string().max(100_000),  // generous; runtime still caps at 15K for prompts
```
This bounds total request size at the Zod layer before any processing begins.

- **Pros:** Correct place for the constraint; rejects bad requests early
- **Effort:** Tiny
- **Risk:** None — 100K chars covers all legitimate Substack content

### Option B: Cap `bodyText` in Zod via `.transform()`
```typescript
bodyText: z.string().max(100_000).transform(s => s.slice(0, MAX_BODY_CHARS)),
```
Eliminates the separate `.map()` pass that caps bodyText post-parse.
- **Pros:** Combines validation + transformation; removes 4 lines of post-parse code
- **Cons:** Slightly less obvious to readers unfamiliar with Zod transforms

## Recommended Action

Option A as a minimum. Option B for the bodyText field to also eliminate the redundant post-parse map.

## Technical Details

**Affected file:** `src/app/api/curate/route.ts:19-20`

## Acceptance Criteria

- [ ] `bodyHtml: z.string().max(100_000)` (or similar) added to schema
- [ ] `bodyText` bounded in schema
- [ ] Total request body size is bounded before any memory allocation for processing

## Work Log

- 2026-03-29: Found during security review of batch fixes (round 2)
