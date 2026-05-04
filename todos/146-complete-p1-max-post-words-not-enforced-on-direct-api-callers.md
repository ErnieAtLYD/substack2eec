---
status: complete
priority: p1
issue_id: "146"
tags: [code-review, security, regression, prompt-injection, dos]
dependencies: []
---

# `MAX_POST_WORDS` No Longer Enforced For Direct `/api/curate` Callers (Regression of #009)

## Problem Statement

The dupes refactor moved `MAX_POST_WORDS = 2500` into `src/lib/html-text.ts` and dropped the export from `src/lib/substack.ts`. The constant is now imported nowhere outside its own module. The web UI still passes through truncated `bodyText`, but the documented Agent API surface (`POST /api/curate`) accepts a client-supplied `bodyText` validated only by `z.string().max(100_000)` and clipped only by a route-level `MAX_BODY_CHARS = 15_000` character slice. There is no server-side word-count enforcement.

This re-opens the cap-bypass that todo `009-complete-p2-bodyText-length-cap-bypass-direct-api.md` was filed to close: an agent calling the route directly can submit ~3,000+ words per post (still under 15,000 chars), 50 posts at a time, sized for a budget that assumed 2,500 words.

## Findings

**Locations:**
- `src/app/api/curate/route.ts:26-29` — only enforces `MAX_BODY_CHARS = 15_000` (chars, not words)
- `src/types/index.ts:37` — `bodyText: z.string().max(100_000)`
- `src/lib/html-text.ts:3` — `MAX_POST_WORDS` exported but unused outside the module

Flagged by security-sentinel (P1-1). Also tied to performance-oracle's observation that `MAX_POST_WORDS` is no longer load-bearing.

## Risk

- Anthropic ITPM rate-limit budget was sized around 2,500-word truncation; bypass amplifies LLM cost.
- Larger attacker-controlled `bodyText` increases prompt-injection surface area below sanitization heuristics.
- `wordCount` field is comment-documented as "from Substack API" — i.e. attacker-supplied via the agent route, untrustworthy.

## Proposed Solutions

### Option A: Re-enforce word cap at the route boundary

Run incoming `bodyText` through a `truncateToWords(text, MAX_POST_WORDS)` helper inside `/api/curate` before composing the prompt. Same code that `extractTextFromHtml` runs internally — extract the truncation logic so both paths share it.

- Pros: Closes the bypass at the trust boundary.
- Cons: Pulls truncation cost onto every curate request, even for trusted callers.
- Effort: Small.

### Option B: Tighten Zod max to a word-equivalent character ceiling

Drop `bodyText` zod max from 100,000 to e.g. `~MAX_POST_WORDS * 8 = 20_000` chars and remove `MAX_BODY_CHARS` slice.

- Pros: Single source of truth at validation time.
- Cons: Per-character is a coarse proxy for word count; still drift-prone.
- Effort: Small.

### Option C: Hybrid — Zod `.transform` that runs `truncateToWords`

- Pros: Validation and truncation share one place; bytes never reach the prompt unbounded.
- Cons: Slightly more involved; must be unit-tested.
- Effort: Small-Medium.

## Recommended Action

_Pending triage._ Lean toward Option A or C — the original 009 fix established that word-cap enforcement at the route is the contract.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts`
- `src/lib/html-text.ts`
- `src/types/index.ts`

## Acceptance Criteria

- [ ] A direct call to `/api/curate` with `bodyText` containing >2,500 words is truncated server-side before reaching `src/lib/ai.ts`
- [ ] Test added that mirrors the 009 regression case (large `bodyText`, expect server cap)
- [ ] `MAX_POST_WORDS` remains the only word-cap constant — no second definition introduced

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.
_2026-05-04:_ Resolved in commit 56a630a. Applied `truncateTextToWords(p.bodyText.slice(0, MAX_BODY_CHARS), MAX_POST_WORDS)` in `src/app/api/curate/route.ts` so the cap runs at the trust boundary. Regression test in `src/__tests__/curate-route-word-cap.test.ts` confirms 4,000-word `bodyText` is reduced to ≤ MAX_POST_WORDS before reaching the AI module.

## Resources

- `todos/009-complete-p2-bodyText-length-cap-bypass-direct-api.md` (the original, now-regressed finding)
- `docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md`
