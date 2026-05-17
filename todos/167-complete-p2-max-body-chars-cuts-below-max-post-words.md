---
status: complete
priority: p2
issue_id: "167"
tags: [code-review, correctness, llm-input-quality]
dependencies: []
---

# `MAX_BODY_CHARS = 15_000` Frequently Cuts BEFORE `MAX_POST_WORDS = 2500` Can Run

## Problem Statement

`/api/curate` route slices to `MAX_BODY_CHARS = 15_000` chars *before* `truncateTextToWords` runs at the word cap. For typical English prose at ~5-6 chars per word + space, 15K chars ≈ 2500-3000 words. Two consequences:

1. The char slice is the binding constraint for normal English content — the word cap rarely fires.
2. The route comment claims "char slice bounds DoS surface before the word-aware truncation does the cap that the LLM budget actually depends on" — but in practice the char slice silently mid-word truncates and the word cap then walks back to a sentence boundary inside the already-amputated text.
3. For non-Latin content (CJK, emoji-heavy), the asymmetry inverts: 15K chars ≪ 2500 words, so non-English Substacks get drastically more aggressive truncation than English ones.

Flagged by kieran-typescript-reviewer (P2) and security-sentinel (P3) — same root cause, different framing.

## Findings

**Location:** `src/app/api/curate/route.ts:33`; `src/types/index.ts` (`MAX_BODY_CHARS = 15_000`)

The two caps are not coordinated. The comment promises the word cap does the LLM-budget work; in practice the char cap dominates.

## Proposed Solutions

### Option A: Raise `MAX_BODY_CHARS` so the word cap is always binding (recommended)

```ts
export const MAX_BODY_CHARS = 30_000   // ≈ 2× MAX_POST_WORDS × 6 chars
```

- Pros: Makes the comment true. `MAX_BODY_CHARS` becomes a pure DoS bound; `MAX_POST_WORDS` becomes the LLM cap.
- Cons: Doubles peak memory per post. For 50 posts × 30KB = 1.5MB, still trivial.
- Effort: Trivial. Add a test pinning the relationship.

### Option B: Document the intent and accept the asymmetry

Update the comment to: "char cap is the primary DoS gate; word cap is a secondary refinement that may or may not fire."

- Pros: Zero code change.
- Cons: Doesn't fix the non-English asymmetry; preserves the misleading shape.
- Effort: Trivial.

### Option C: Conditional widening for high-density scripts

Detect non-Latin density and widen the char slice. Likely overengineered.

- Pros: Even-handed across languages.
- Cons: Code complexity for marginal benefit at current scale.
- Effort: Medium.

## Recommended Action

_Pending triage._ Option A. Add a unit test asserting the relationship: `MAX_BODY_CHARS >= MAX_POST_WORDS * AVG_CHAR_PER_WORD * SAFETY_FACTOR`.

## Technical Details

**Affected files:**
- `src/types/index.ts`
- `src/app/api/curate/route.ts` (comment update)
- `src/__tests__/curate-route-word-cap.test.ts` (add: 20K-char input still gets word-truncated)

## Acceptance Criteria

- [ ] For typical English prose, the word cap is the binding constraint, not the char cap
- [ ] A test fixture demonstrates this relationship

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.
_2026-05-17:_ Resolved — `src/lib/limits.ts:13` is now `MAX_BODY_CHARS = 30_000` (Option A). Comment at the constant explicitly references the "shadowing MAX_POST_WORDS" diagnosis from this todo. CLAUDE.md "Key rules" documents the new value and the binding-constraint reasoning.

## Resources

- `src/app/api/curate/route.ts:24-36`
- Related: #146 (the trust-boundary fix this comment refers to)
