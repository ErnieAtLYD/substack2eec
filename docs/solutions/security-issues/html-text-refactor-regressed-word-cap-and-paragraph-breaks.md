---
title: "html-text refactor regressed the MAX_POST_WORDS trust boundary and silently broke paragraph breaks on truncation"
category: security-issues
related_issues:
  - "todos/009-complete-p2-bodyText-length-cap-bypass-direct-api.md"
  - "todos/146-complete-p1-max-post-words-not-enforced-on-direct-api-callers.md"
  - "todos/147-complete-p1-extracttext-truncation-destroys-paragraph-breaks.md"
  - "todos/148-complete-p1-html-text-no-tests.md"
related_prs:
  - "PR #17 (todos-and-docs branch)"
fix_commits:
  - "eeb3b70 refactor(html-text): extract shared HTML-to-text helper"
  - "5322d56 fix(html-text): preserve paragraph breaks across truncation boundary"
  - "56a630a fix(curate): enforce MAX_POST_WORDS on client-supplied bodyText"
tags:
  - regression
  - prompt-injection
  - dos
  - llm-input-quality
  - refactor-hazard
  - trust-boundary
date_solved: 2026-05-04
---

# html-text refactor regressed the `MAX_POST_WORDS` trust boundary and silently broke paragraph breaks on truncation

## Symptoms

Two distinct symptoms surfaced together during code review of the `extractTextFromHtml` extraction refactor (commit `eeb3b70`):

1. **Direct `/api/curate` callers could submit posts well over the 2,500-word LLM budget.** Validation accepted up to `z.string().max(100_000)`; the route only sliced to `MAX_BODY_CHARS = 15_000` characters. No word-count cap was applied server-side. The web UI was unaffected because it pre-truncated through `/api/fetch-posts`, but the documented Agent API surface lost its enforcement.
2. **Posts above `MAX_POST_WORDS` reached the LLM as a flat wall of text with no paragraph breaks**, while shorter posts retained their `\n\n` block separators. The most expensive long-input path got the lowest-quality input shape.

Neither symptom produced an error or test failure — both were caught only by multi-agent review (security-sentinel flagged #1; performance-oracle flagged #2 as a quality regression).

## Root cause

A single refactor — moving `extractTextFromHtml` and `MAX_POST_WORDS = 2500` from `src/lib/substack.ts` into a new shared `src/lib/html-text.ts` so `spike/extract.ts` and the production fetcher could share one implementation — caused both bugs.

### Bug 1: silent loss of a trust-boundary enforcement

Before the refactor, `MAX_POST_WORDS` ran inside `extractTextFromHtml`, which was only invoked from `/api/fetch-posts`. Todo #009 had previously closed a related cap-bypass by adding `MAX_BODY_CHARS = 15_000` (a character slice) at the `/api/curate` route — the trust boundary for direct API callers.

After the move, `MAX_POST_WORDS` was exported but no longer imported anywhere outside its own module. The route still ran the char slice, but the **word cap that the Anthropic budget was actually sized against** was no longer wired into the trust boundary. A direct caller could submit ~3,000+ words per post under the 15K char ceiling, 50 posts per request — the exact bypass #009 had been filed to close, re-opened.

This is the subtle hazard: the constant survived the refactor (still exported), the production code still ran (UI pre-truncates), and tests still passed (no test pinned the route's word-cap behavior). The regression was invisible from inside the diff.

### Bug 2: split/join collapsed paragraph breaks

The truncation branch in `extractTextFromHtml` originally read:

```ts
const words = text.split(/\s+/)
if (words.length <= MAX_POST_WORDS) return text
let candidate = words.slice(0, MAX_POST_WORDS).join(' ')
```

`extractTextFromHtml` deliberately inserts `\n\n` after every block element so the LLM sees paragraph structure. But `split(/\s+/)` treats `\n\n` as ordinary whitespace — paragraph separators were destroyed at the moment of splitting, then re-joined with single spaces. So:

- Posts under the cap: paragraph breaks preserved.
- Posts over the cap: paragraph breaks gone.

Inconsistent input shape on the most expensive code path. CLAUDE.md explicitly notes "LLM context is the dominant cost; this code is preprocessing" — so a quality regression here mattered more than its size suggested.

## Fix

Three commits, ordered by dependency:

### 1. `eeb3b70` — extract the helper (the refactor that introduced both bugs)

`extractTextFromHtml` and `MAX_POST_WORDS` move into `src/lib/html-text.ts`. An opt-in `truncationMarker` option preserves the spike's `[truncated]` suffix without changing the LLM-facing payload.

### 2. `5322d56` — fix paragraph-break preservation, extract truncation as a named helper

Replace split/join with a `\S+` cursor that walks word boundaries on the original string and slices at the cut index. Any `\n\n` inside the kept range survives. The sentence-boundary walkback (`. ` / `! ` / `? `) is unchanged.

```ts
// src/lib/html-text.ts
export function truncateTextToWords(
  text: string,
  maxWords: number,
  truncationMarker = '',
): string {
  const wordRe = /\S+/g
  let count = 0
  let cutIndex = -1
  let m: RegExpExecArray | null
  while ((m = wordRe.exec(text)) !== null) {
    count++
    if (count > maxWords) {
      cutIndex = m.index
      break
    }
  }
  if (cutIndex === -1) return text

  let candidate = text.slice(0, cutIndex).trimEnd()
  const lastSentenceEnd = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('? '),
  )
  if (lastSentenceEnd > 0) {
    candidate = candidate.slice(0, lastSentenceEnd + 1)
  }

  return candidate + truncationMarker
}
```

`truncateTextToWords` is exported as a named helper specifically so the route can reuse it on attacker-supplied `bodyText`.

Tests added in `src/lib/__tests__/html-text.test.ts` (13 cases) pin: untruncated short HTML, paragraph break insertion, noise-selector removal, marker semantics (appended only on truncate), paragraph preservation across the truncation boundary, and edge cases (empty input, exactly-at-cap, no sentence boundary).

### 3. `56a630a` — re-enforce the word cap at the trust boundary

Run `truncateTextToWords` after the char slice in `/api/curate`:

```ts
// src/app/api/curate/route.ts
const posts = body.posts.map(p => ({
  ...p,
  bodyText: truncateTextToWords(
    (typeof p.bodyText === 'string' ? p.bodyText : '').slice(0, MAX_BODY_CHARS),
    MAX_POST_WORDS,
  ),
}))
```

The char slice stays as defense-in-depth (bounds DoS surface before the word walk runs). The word truncation is now the cap the LLM budget actually depends on, applied at the route boundary — not at extraction time.

Regression test in `src/__tests__/curate-route-word-cap.test.ts`: a 4,000-word `bodyText` is reduced to ≤ `MAX_POST_WORDS` before reaching the AI module.

## Prevention

### Pin trust-boundary contracts with tests, not by inspection

#009 was originally closed by adding code, not by adding a test that *proved* the route truncates. Two years later (well, two weeks), a refactor that didn't touch the route deleted the contract anyway. The right defense is a test at the trust boundary — `src/__tests__/curate-route-word-cap.test.ts` is now that test. **Any cap that protects an AI cost budget or prompt-injection surface should have a regression test pinned at the route, not relying on a transitive call into a helper module.**

### When moving a constant out of a module, audit its semantic role, not just its imports

`MAX_POST_WORDS` was technically still in scope after the move (still exported, still used in the helper). Static analysis showed no broken imports. But its *role* — "the word cap the LLM budget is sized against, applied at the trust boundary" — depended on `extractTextFromHtml` being on the path between client input and AI prompt. The refactor broke that path silently. **Before moving constants that protect a trust boundary, grep for the values that depend on them being applied (here: the Anthropic ITPM budget, the prompt-injection sanitization sizing) — not just for imports of the constant name.**

### Don't `split/join` text whose whitespace is meaningful

`text.split(/\s+/).slice().join(' ')` is the canonical word-count helper, but it silently destroys any structure encoded as whitespace — `\n\n`, indentation, tabs. When the upstream code took care to insert `\n\n` between block elements, the truncation step needed to know that. **Prefer cursor-walking the original string (`/\S+/g.exec`) over split/join when whitespace carries meaning downstream.**

### New shared modules need a test file before the helper moves

`parseSSEStream` extraction shipped with `src/components/features/__tests__/parseSSEStream.test.ts`. `extractTextFromHtml` extraction did not, despite the entire point of the refactor being "make it testable in isolation." Bug #147 would have been caught by the first paragraph-preservation test. **For shared-helper extractions, write the test file in the same commit as the move, not as a follow-up.**

## Cross-references

- `todos/009-complete-p2-bodyText-length-cap-bypass-direct-api.md` — the original cap-bypass closed by `MAX_BODY_CHARS`; #146 is its regression.
- `docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md` — sibling control: param allowlist at the same trust boundary.
- `docs/solutions/security-issues/prompt-injection-llm-pipeline.md` — the sanitization the word cap is sized against.
- `src/lib/html-text.ts:38-66` — `truncateTextToWords` (the shared helper now reused by the route).
- `src/app/api/curate/route.ts:26-33` — enforcement point for direct API callers.
- `src/lib/__tests__/html-text.test.ts` — paragraph-preservation regression test for #147.
- `src/__tests__/curate-route-word-cap.test.ts` — trust-boundary regression test for #146.
