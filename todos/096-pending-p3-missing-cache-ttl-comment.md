---
status: pending
priority: p3
issue_id: "096"
tags: [code-review, agent-native, documentation, prompt-caching]
dependencies: []
---

# Missing Cache TTL Comment Near `cache_control` Annotation — Todo 070 Acceptance Criteria Gap

## Problem Statement

Todo 070 (prompt cache regression in picking step) was marked complete, but its acceptance criteria included adding a code comment near the `cache_control: { type: 'ephemeral' }` annotation in `rewriteAsLesson` explaining the 5-minute TTL and picking step impact.

Reading `src/lib/ai.ts:391`, the `cache_control` annotation is applied without any comment. The tradeoff (if user spends >5 min on the picking step, the cache will miss on the first lesson rewrite) is non-obvious to future maintainers.

## Findings

- `src/lib/ai.ts:391` — `cache_control: { type: 'ephemeral' }` with no explanation
- Todo 070 acceptance criteria: "add code comment near cache_control explaining 5-min TTL"

**Source:** Agent-native reviewer

## Proposed Solutions

### Option A — Add a comment (Recommended)
```ts
// Note: ephemeral cache TTL is 5 min. If the user spends >5 min on the picking
// step before confirming, this cache will miss on the first lesson rewrite.
cache_control: { type: 'ephemeral' },
```

**Effort:** Trivial | **Risk:** None

## Recommended Action

Option A.

## Technical Details

**Affected files:**
- `src/lib/ai.ts:391`

## Acceptance Criteria

- [ ] Comment added explaining ephemeral TTL and picking-step latency impact

## Work Log

- 2026-04-04: Found by agent-native reviewer (todo 070 gap)
