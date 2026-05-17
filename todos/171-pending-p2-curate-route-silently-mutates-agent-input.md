---
status: pending
priority: p2
issue_id: "171"
tags: [code-review, agent-native, observability, api-design]
dependencies: []
---

# `/api/curate` Silently Mutates Agent-Supplied Input — No SSE Event Signals Truncation

## Problem Statement

When a direct API caller submits a 4000-word `bodyText`, the route silently truncates to 2500. The SSE stream emits `selection` → `lesson_start` → `lesson_chunk` → `lesson_done` → `done` with no indication that input was reshaped. The agent author has no in-band signal.

This is a parity gap. The UI never trips the cap (it pre-truncates via `/api/fetch-posts`). An agent author reading CLAUDE.md sees `posts: SubstackPost[]` and reasonably expects round-trip fidelity. They get silent mutation instead.

Flagged by agent-native-reviewer (P2).

## Findings

**Location:** `src/app/api/curate/route.ts:30-36` (the silent mutation); `src/types/index.ts` (`CurateSSEEvent` union — no event for input normalization); `CLAUDE.md` `/api/curate` section (no doc).

## Proposed Solutions

### Option A: Emit a one-shot `input_normalized` SSE event when truncation fires (recommended)

```ts
// route.ts
const truncated: string[] = []
const posts = body.posts.map(p => {
  const original = (typeof p.bodyText === 'string' ? p.bodyText : '').slice(0, MAX_BODY_CHARS)
  const capped = truncateTextToWords(original, MAX_POST_WORDS)
  if (capped.length < original.length) truncated.push(p.slug)
  return { ...p, bodyText: capped }
})
// inside the stream start():
if (truncated.length) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
    type: 'input_normalized',
    truncatedSlugs: truncated,
    maxPostWords: MAX_POST_WORDS,
  })}\n\n`))
}
```

Add `{ type: 'input_normalized'; truncatedSlugs: string[]; maxPostWords: number }` to `CurateSSEEvent` union, and a row to the SSE table in CLAUDE.md.

- Pros: Observable; agent can react. Cheap. Fits existing SSE pattern.
- Cons: New event type; agents must handle (or ignore) it. Backward-compatible.
- Effort: Small (~10 LOC + doc).

### Option B: Add a `truncated: boolean` field to each post in the `selection` event

- Pros: Less new surface than a new event.
- Cons: `selection` is already a CuratedSelection; adding fields complicates its schema and crosses concerns (curation result vs input metadata).
- Effort: Small but messier.

### Option C: Reject oversize input with 413 instead of truncating

- Pros: Cleanest; agent must comply or fail loudly.
- Cons: Breaking change for any agent that relies on current silent-truncate behavior. Worse UX. Defeats the defense-in-depth purpose.
- Effort: Trivial code, big policy.

## Recommended Action

_Pending triage._ Option A. Pair with the test in #169 to assert observability.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts`
- `src/types/index.ts` (`CurateSSEEvent`)
- `CLAUDE.md` (SSE table)
- `src/__tests__/curate-route-word-cap.test.ts` (assert event emitted on truncation)

## Acceptance Criteria

- [ ] Oversize `bodyText` produces an `input_normalized` SSE event before `selection`
- [ ] Event includes the slugs truncated and the active cap value
- [ ] CLAUDE.md SSE table documents the event

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/app/api/curate/route.ts:30-36`
- `CLAUDE.md` `/api/curate` SSE event table
- Related: #172 (CLAUDE.md doc gap), #173 (/api/limits discovery endpoint)
