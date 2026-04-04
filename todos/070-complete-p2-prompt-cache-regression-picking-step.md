---
status: pending
priority: p2
issue_id: "070"
tags: [code-review, performance, prompt-caching, multi-candidate]
dependencies: []
---

# Ephemeral Prompt Cache Will Miss When User Spends >5 Min on Picking Step

## Problem Statement

`rewriteAsLesson` in `src/lib/ai.ts` applies `cache_control: { type: 'ephemeral' }` to the `courseContextText` block (the `<course>` XML block). This cache has a 5-minute TTL on Anthropic's side. For a 5-lesson course, lessons 2–5 hit the cache for the course context on each rewrite call, saving ~300–500 input tokens per call.

The new picking step introduces a mandatory human-in-the-loop pause between candidate proposal and generation. If the user takes longer than 5 minutes to pick a candidate, the ephemeral cache is cold when generation begins. All 5 rewrite calls pay full input token cost for the course context — 5× the cache benefit is lost.

In the original pipeline, proposal-to-generation was a single request with zero human delay. This is a design consequence of the new UX, not a bug — but the plan does not acknowledge it.

## Findings

**Source:** Performance oracle (finding 2)

**Affected code:** `src/lib/ai.ts:261-269` — `cache_control: { type: 'ephemeral' }` on `courseContextText`

The cache key is the content hash of the cached block. With `selectedCourse` round-tripping through the client (JSON → React state → POST body), the string values are lossless in normal operation, so the cache would be warm within the 5-minute window. Beyond 5 minutes, it is unconditionally cold.

## Proposed Solutions

### Option A — Acknowledge in plan; accept as a known tradeoff (Recommended for now)

Document in the plan's "Technical Considerations" or a new "Performance Notes" section that:
- The ephemeral cache will miss for users who spend >5 minutes on the picking step
- At current Sonnet pricing, this is approximately $0.003–0.005 per full cache miss per course (rough estimate; negligible for a personal tool)
- No architectural change is needed unless the app scales to high volume

**Pros:** No code change required; honest acknowledgment prevents future confusion
**Effort:** Minimal (plan update only)
**Risk:** Low

### Option B — Remove the `cache_control` annotation and accept full input cost always

Since the cache hit rate will be unpredictable with the new UX, remove the annotation to simplify the code.

**Pros:** Removes a micro-optimization that no longer reliably fires
**Cons:** Slightly increases cost for fast users who pick within 5 minutes
**Effort:** Trivial (delete 3 lines)
**Risk:** Low

## Recommended Action

Option A for the initial implementation. If the app scales, revisit Option B or explore server-side session storage to preserve the cache within a session.

## Technical Details

- **File:** `src/lib/ai.ts:261-269`
- **Cache TTL:** 5 minutes (Anthropic ephemeral cache)
- **Token savings per cache hit:** ~300–500 input tokens per rewrite call

## Acceptance Criteria

- [ ] Plan document acknowledges the cache regression explicitly
- [ ] Implementation note added in code comment near `cache_control` annotation explaining the 5-minute TTL and picking step impact
- [ ] No silent assumption that caching provides the same benefit as pre-feature

## Work Log

- 2026-04-04: Created during plan review. Performance oracle flagged.
