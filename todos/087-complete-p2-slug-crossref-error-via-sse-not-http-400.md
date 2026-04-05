---
status: pending
priority: p2
issue_id: "087"
tags: [code-review, agent-native, api-design, sse]
dependencies: []
---

# Slug Cross-Reference Error Delivered via SSE `error` Event (Not HTTP 400) — Undocumented

## Problem Statement

When `selectedCourse.lessons` contain slugs not in the submitted posts, the curate route delivers the error via SSE after the stream has already opened with `200 OK`:

```ts
enqueue({ type: 'error', message: 'Selected course references posts not in the submitted list.' })
controller.close()
return
// src/app/api/curate/route.ts:79–83
```

This means an agent that checks `if (!res.ok)` after opening the stream will miss this error entirely and proceed with an empty lesson set (no `lesson_done` events, then a `done` event with empty lessons array).

The CLAUDE.md documentation says nothing about this behavior.

## Findings

- `src/app/api/curate/route.ts:76–84` — slug validation fires after stream opens
- CLAUDE.md Step 2 — no mention of slug cross-reference errors as SSE events
- HTTP status is 200 even for this validation failure

**Source:** Agent-native reviewer

## Proposed Solutions

### Option A — Return HTTP 400 before opening the stream (Recommended)
Move slug validation before the `ReadableStream` constructor:

```ts
// Before new ReadableStream(...)
if (body.selectedCourse) {
  const postSlugs = new Map(posts.map(p => [p.slug, true]))
  const bad = body.selectedCourse.lessons.filter(l => !postSlugs.has(l.slug))
  if (bad.length > 0) {
    return NextResponse.json({ error: 'Selected course references posts not in the submitted list.' }, { status: 400 })
  }
}
// Then open the stream...
```

**Pros:** Agents checking `res.ok` get the correct signal. Consistent with how other validation errors (400 from Zod) are returned.
**Cons:** Requires restructuring the route slightly.
**Effort:** Small | **Risk:** Low

### Option B — Document the SSE error behavior in CLAUDE.md
Add a note to Step 2: "Slug cross-reference errors arrive as SSE `error` events (HTTP 200), not HTTP 4xx. Always parse the stream for `error` events."

**Pros:** Zero code change.
**Cons:** Inconsistent API design; HTTP 200 for validation failure is surprising.
**Effort:** Trivial | **Risk:** Medium (agents written without knowing this will misbehave)

## Recommended Action

Option A — return 400 before opening the stream. Matches the behavior of all other validation errors in the app.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts:67–84`

## Acceptance Criteria

- [ ] Slug cross-reference validation failure returns HTTP 400 (not 200 with SSE error)
- [ ] OR: CLAUDE.md documents the SSE error delivery explicitly
- [ ] Agent checking `if (!res.ok)` catches this error correctly

## Work Log

- 2026-04-04: Found by agent-native reviewer
