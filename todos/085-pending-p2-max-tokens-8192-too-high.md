---
status: pending
priority: p2
issue_id: "085"
tags: [code-review, performance, cost, ai]
dependencies: []
---

# `max_tokens: 8192` in `proposeCourseCandidates` Is 5-6× Higher Than Needed

## Problem Statement

`proposeCourseCandidates` uses `max_tokens: 8192` (`src/lib/ai.ts:233`). The expected output is 3 `CuratedSelection` objects, each with 5 lessons. Rough output size estimate:

- Per candidate: courseTitle (~50) + courseDescription (~200) + targetAudience (~80) + overallRationale (~300) + 5 lessons × (slug ~40 + lessonFocus ~120 + selectionRationale ~120) ≈ 1,530 chars
- 3 candidates + JSON/tool envelope: ~5,000–5,500 chars ≈ **1,250–1,400 tokens**

By comparison, `curatePostSelection` uses `max_tokens: 4096` for a *single* candidate — which is already 3× its expected output. For 3 candidates, 4096 would be adequate and conservative.

Setting `max_tokens: 8192` doesn't cause extra cost (Anthropic charges for tokens generated, not max_tokens), but it:
1. Makes the `stop_reason === 'max_tokens'` error guard trigger at the wrong threshold
2. Signals miscalibration that could mask real truncation problems
3. Increases worst-case latency (non-streaming call; larger max_tokens = longer possible wait)

## Findings

- `src/lib/ai.ts:233` — `max_tokens: 8192`
- `src/lib/ai.ts:116` — `curatePostSelection` uses `max_tokens: 4096` for a single candidate

**Source:** Performance oracle review

## Proposed Solutions

### Option A — Reduce to 4096 (Recommended)
Matches the existing `curatePostSelection` calibration. Adequate for 3× the output since the rationale/description fields are shorter than lesson markdown bodies.

**Effort:** Trivial | **Risk:** None

### Option B — Reduce to 5120 (Conservative headroom)
Allows for 10-lesson candidates (schema max) with long descriptions. Adds safety margin over 4096.

**Effort:** Trivial | **Risk:** None

## Recommended Action

Option B (`max_tokens: 5120`) — adds safety margin for 10-lesson candidates while still eliminating the miscalibration.

## Technical Details

**Affected files:**
- `src/lib/ai.ts:233`

## Acceptance Criteria

- [ ] `max_tokens` in `proposeCourseCandidates` reduced to ≤5120
- [ ] `stop_reason` guard still present
- [ ] Tested that 3 × 5-lesson candidates fit within the new limit

## Work Log

- 2026-04-04: Found by performance oracle review
