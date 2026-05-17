---
status: pending
priority: p1
issue_id: "162"
tags: [code-review, security, prompt-injection, trust-boundary, defense-in-depth]
dependencies: []
---

# `/api/curate` Trust Boundary Caps `bodyText` But Leaves `title`, `subtitle`, `excerpt` Unbounded By The Route Itself

## Problem Statement

PR #17 re-enforced `MAX_POST_WORDS` on `bodyText` at the `/api/curate` trust boundary because direct API callers were bypassing the cap. But the same threat model applies to `title`, `subtitle`, and `excerpt` — all of which flow into the LLM prompt — and the route does not cap them. Today, `sanitizeForPrompt` in `src/lib/ai.ts` re-caps each to 300 chars *downstream*, so the prompt size is bounded today. But the defense lives in a helper that any future caller of `curatePostSelection` could bypass — exactly the regression shape the PR was filed to fix.

The route comment at `src/app/api/curate/route.ts:27-29` says "this is the enforcement point for direct API callers." That claim is false for every prompt-bound field except `bodyText`.

## Findings

**Location:** `src/app/api/curate/route.ts:30-36` (only `bodyText` truncated); `src/types/index.ts:36` (`excerpt: z.string().max(500)`); `src/lib/ai.ts:84-99` (`sanitizeForPrompt` is the actual de-facto cap, applied downstream).

The Zod schema accepts:
- `title.max(500)` — embedded in curation prompt verbatim before `sanitizeForPrompt` re-caps to 300
- `subtitle.max(500)` — same
- `excerpt.max(500)` — same

50 posts × 500-char unbounded `excerpt` = 25KB of attacker-controlled text reaching `formatPostsForCuration` before any sanitization. The current downstream cap saves us, but it's transitive — exactly what #146 fixed for `bodyText`.

Flagged by security-sentinel (P1) and confirmed against `docs/solutions/security-issues/prompt-injection-llm-pipeline.md` by learnings-researcher.

## Proposed Solutions

### Option A: Apply `sanitizeForPrompt`-equivalent caps at the route (recommended)

Mirror what `bodyText` got: slice + cap each prompt-bound field at the route boundary, not downstream.

```ts
const PROMPT_FIELD_MAX = 300
const cap = (s: string | null | undefined) =>
  typeof s === 'string' ? s.slice(0, PROMPT_FIELD_MAX) : s
const posts = body.posts.map(p => ({
  ...p,
  title: cap(p.title) ?? '',
  subtitle: cap(p.subtitle),
  excerpt: cap(p.excerpt),
  bodyText: truncateTextToWords(
    (typeof p.bodyText === 'string' ? p.bodyText : '').slice(0, MAX_BODY_CHARS),
    MAX_POST_WORDS,
  ),
}))
```

- Pros: Trust boundary owns the contract end-to-end. `sanitizeForPrompt` becomes belt-and-suspenders.
- Cons: Couples the route to specific prompt shape; if `sanitizeForPrompt` policy changes, two places to update.
- Effort: Small.

### Option B: Tighten the schema instead

Drop the Zod caps on `title`/`subtitle`/`excerpt` from 500 → 300 to match `sanitizeForPrompt`. Single source of truth.

- Pros: One change, no route logic.
- Cons: Surface change for any agent caller currently sending 301-500 char fields. Validation rejects rather than truncating — different UX.
- Effort: Trivial.

### Option C: Add a regression test only

Pin that `formatPostsForCuration` receives ≤300-char fields. Catches regression without restructuring.

- Pros: Cheapest.
- Cons: Doesn't move the enforcement to the trust boundary; only locks current behavior.
- Effort: Trivial.

## Recommended Action

_Pending triage._ Option A is the most consistent with #146's fix philosophy ("trust boundary owns the contract"). Combine with Option C.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts`
- `src/__tests__/curate-route-word-cap.test.ts` (extend coverage)
- `src/types/index.ts` (only if Option B)

## Acceptance Criteria

- [ ] Direct API caller cannot inject >300 chars per prompt-bound field through any post field reaching the LLM
- [ ] Regression test pins the cap at the route boundary, not in `ai.ts`

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17. Same shape as #146 but for sibling fields the original review missed.

## Resources

- Related: #146 (the analogous fix for `bodyText`)
- `docs/solutions/security-issues/prompt-injection-llm-pipeline.md`
- `docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md` — the lesson "pin trust-boundary contracts with tests, not by inspection" applies here
