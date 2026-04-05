---
status: pending
priority: p1
issue_id: "079"
tags: [code-review, performance, payload, waste]
dependencies: []
---

# Full Post Bodies (`bodyText` + `bodyHtml`) Sent to Propose-Courses — ~97% Wasted

## Problem Statement

`handleGenerate` sends the full `SubstackPost[]` array including `bodyText` and `bodyHtml` to `/api/propose-courses`:

```ts
body: JSON.stringify({ posts, lessonCount: 5 })
// src/components/features/ReviewForm.tsx:157
```

However, `proposeCourseCandidates` only calls `formatPostsForCuration`, which reads `slug`, `title`, `subtitle`, `publishedAt`, `wordCount`, and `excerpt`. It never touches `bodyText` or `bodyHtml`. The route does truncate `bodyText` to `MAX_BODY_CHARS`, but that truncated value is then discarded.

**Wasted payload at max load:**
- 50 posts × (15,000-char bodyText + ~15,000-char bodyHtml + ~1,000 metadata) ≈ **1.5 MB uploaded per request**
- Of that, ~1.45 MB (bodyText + bodyHtml) is transmitted and discarded — ~97% wasted bandwidth
- The user also incurs a double upload: once to propose-courses, then again to curate when they confirm a candidate

## Findings

- `src/components/features/ReviewForm.tsx:157` — sends full `posts` array
- `src/lib/ai.ts:217` — `formatPostsForCuration` only reads metadata fields, never bodyText
- `src/app/api/propose-courses/route.ts:37–40` — truncates bodyText but `proposeCourseCandidates` ignores it

**Source:** Performance oracle review

## Proposed Solutions

### Option A — Strip body fields before propose-courses fetch (Recommended)
In `ReviewForm.tsx handleGenerate`, destructure out the body fields:

```ts
body: JSON.stringify({
  posts: posts.map(({ bodyText: _bt, bodyHtml: _bh, ...meta }) => meta),
  lessonCount: 5,
})
```

Update `ProposeRequestSchema` to not require `bodyText`/`bodyHtml` (make them optional or remove them).

**Pros:** Eliminates ~97% of the propose-courses request payload. Zero server-side change needed.
**Cons:** ProposeRequestSchema needs updating; slight divergence from the SubstackPost type.
**Effort:** Small
**Risk:** Low

### Option B — Define a slimmer `PostMeta` type for propose-courses
Create `PostMeta = Omit<SubstackPost, 'bodyText' | 'bodyHtml'>` in `types/index.ts` and update the propose-courses Zod schema to match.

**Pros:** Type-safe; makes the intent explicit at the schema level.
**Cons:** A bit more upfront work; adds a type to maintain.
**Effort:** Small–Medium
**Risk:** Low

### Option C — Keep as-is
Accept the wasted bandwidth.

**Pros:** No change.
**Cons:** ~1.5 MB wasted per propose request. Especially bad on slow mobile connections.
**Effort:** None
**Risk:** UX regression on poor connections (propose-courses step feels slow)

## Recommended Action

Option A for immediate fix; Option B if the team wants the type safety.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:157`
- `src/app/api/propose-courses/route.ts` (schema update)

## Acceptance Criteria

- [ ] Propose-courses request payload does not include `bodyText` or `bodyHtml`
- [ ] `proposeCourseCandidates` still receives all fields it needs (slug, title, subtitle, publishedAt, wordCount, excerpt)
- [ ] Route schema updated to reflect the slimmer input

## Work Log

- 2026-04-04: Found by performance oracle code review
