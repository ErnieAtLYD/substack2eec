---
title: "html-text single-walk extraction eliminated a per-element DOM-mutation hot loop and avoided a loose-text contract hazard"
category: architecture-issues
related_issues:
  - "todos/163-complete-p1-cheerio-after-n-dom-mutations-hot-loop.md"
  - "todos/164-pending-p2-fetch-posts-blocks-event-loop-no-yielding.md"
related_prs:
  - "PR #29 (fix/163-html-text-zero-mutation-walk)"
fix_commits:
  - "7968bd6 perf(html-text): replace per-element DOM mutation with single-walk extraction (#163)"
tags:
  - performance
  - hot-loop
  - dom-mutation
  - cheerio
  - refactor-hazard
  - characterization-tests
  - html-text
date_solved: 2026-06-03
---

# html-text single-walk extraction eliminated a per-element DOM-mutation hot loop and avoided a loose-text contract hazard

## Symptom — what the code review flagged

A performance-oracle pass over PR #17 flagged `extractTextFromHtml` as a **P1** hot-path problem. The function inserted a paragraph break after every block element with a cheerio mutation and then serialized the body:

```ts
$('p, h1, h2, h3, h4, li').after('\n\n')
// ...
$('body').text()
```

`.after('\n\n')` is an **O(n) DOM mutation per block element**: each call goes through cheerio's parse5-style insertion/serialization logic. A 50-paragraph post is 50 separate insertions; a list-heavy "cookbook" post (200+ `<li>`) is 200+ mutations. Because `/api/fetch-posts` runs this up to **50 times per request**, the todo's back-of-envelope put the synchronous, request-thread cost at **10–30 seconds of CPU** — supposedly dwarfing the cheerio parse itself.

## Root cause — why `.after('\n\n')` is wasteful

The mutation was never necessary. The goal is purely *"preserve paragraph breaks in the extracted text"* — the break only needs to exist in the **output string**, not in the DOM. Inserting a real `\n\n` sibling node after every matched element forces cheerio to mutate the live tree N times (each insertion touching the document model and its serialization path), and then `$('body').text()` walks the whole tree again to flatten it. So the old code paid for an O(n) round of tree surgery plus a full text walk, when a single walk suffices.

The cleaner model: do **one depth-first walk** of the already-parsed body subtree. Emit each text node as you encounter it (this is what `.text()` was doing anyway), and emit a `\n\n` *after* finishing a block element's subtree. No nodes are created, the tree is never mutated, and the HTML is never reparsed.

## Fix — the zero-mutation single-walk

The rewrite replaces both the mutation and the `.text()` flatten with one recursive walk, `collectText`, over the parsed body (quoted verbatim from `src/lib/html-text.ts`):

```ts
// Block elements after which a paragraph break is emitted, mirroring the prior
// `$('p, h1, h2, h3, h4, li').after('\n\n')` selector exactly.
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'li'])

function collectText(node: DomNode, out: string[]): void {
  if (node.type === 'text') {
    if (node.data) out.push(node.data)
    return
  }
  if (node.children) {
    for (const child of node.children) collectText(child, out)
  }
  if (node.name && BLOCK_TAGS.has(node.name)) out.push('\n\n')
}
```

Wired into the public function:

```ts
const body = $('body')[0] as unknown as DomNode | undefined
const parts: string[] = []
if (body) collectText(body, parts)

const text = parts.join('')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]{2,}/g, ' ')
  .trim()
```

**Post-order break emission = "after the element."** The `\n\n` push happens *after* the loop over `node.children` returns — i.e., only once the element's entire subtree text has been emitted. That lands the break in exactly the position a following-sibling node would have occupied, so it reproduces `.after('\n\n')` semantics precisely (a heading then paragraph yields a single `\n\n` between them; nested block-in-block yields doubled breaks that the `\n{3,}` collapse then normalizes).

**Loose text is preserved.** Because the walk emits *every* text node (`node.type === 'text'`), text living outside the block selectors — loose `<div>` text, `blockquote` text, inline anchor text — is still captured, exactly as `$('body').text()` captured it. This is the contract that `src/lib/substack.ts:82` excerpting depends on, and it is precisely the bug the todo's originally-proposed "Option A" (`join the matched selectors' .text()`) would have silently introduced by dropping that loose text. Output is therefore **byte-identical** to the old path.

`truncateTextToWords`, `NOISE_SELECTORS`, `MAX_POST_WORDS`, and the public `extractTextFromHtml(html, options)` signature were all left untouched — the change is confined to *how* text + breaks are collected before truncation.

## Measured impact

The P1 framing was overstated. The "200 mutations × 1–3ms × 50 posts = 10–30s" figure was an unverified back-of-envelope. Real benchmarks (`src/lib/__tests__/html-text.bench.ts`, run via `npm run bench`):

| items | new (walk) | old (`.after`) | speedup |
|------:|-----------:|---------------:|--------:|
| 200   | 0.57ms     | 0.77ms         | 1.36×   |
| 1000  | 1.83ms     | 2.87ms         | 1.57×   |
| 2000  | 3.77ms     | 5.83ms         | 1.55×   |
| 4000  | 7.48ms     | 13.18ms        | 1.76×   |

Per-post cost is **single-digit milliseconds, not seconds** — the original estimate was off by roughly **50×**. The old `.after` path is mildly **superlinear** (the gap widens as item count grows), while the new walk is **closer to linear**. Real-world improvement is **~1.5×**, not the 5–10× the todo predicted. The change is still a worthwhile, correctness-preserving win that eliminates the O(n)-mutation pattern, but the true severity was closer to **P3 than P1** (the `p1` was kept in the filename only for issue-ID continuity).

Acceptance criteria confirmed: no DOM mutation inside `extractTextFromHtml`; the html-text suite grew from 138 → 146 tests with 8 added characterization cases (lock-then-refactor); the list-heavy fixture extracts well under the 50ms sanity bound (0.37ms @ 200 items up to ~7.5ms @ 4000 items).

## Prevention

### Verify a proposed fix against the full output contract, not the reviewer's narrow case

A code-review todo's "recommended" option is a hypothesis, not a verdict. Here, the todo recommended Option A — "walk only the matched `p/h1-h4/li` selectors and join their `.text()`" — which would have silently dropped loose text (bare `<div>`, blockquote, anchor, table-cell text) that the current `$('body').text()` captures. That text is load-bearing: `src/lib/substack.ts:82` builds post excerpts from it. The reviewer optimized for the paragraph-break case and never checked the loose-text case.

**Rule:** Before accepting any refactor of an extraction/serialization function, enumerate every consumer of its output (grep the call sites) and confirm the new implementation preserves what each consumer depends on. A fix that is correct for the flagged case but narrows the output contract is a regression, not a fix.

### Lock-then-refactor: pin exact current output with characterization tests before touching behavior-preserving code

This same function was regressed once before (`docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md`) precisely because no test pinned its output. For #163, the exact output of the *unchanged* implementation was captured, hardcoded as 8 characterization tests, and proven green on the old code *first* — only then was the refactor applied and verified to keep them green. That sequence is what proves byte-fidelity; writing the tests against the new code proves nothing.

**Rule:** For any "behavior-preserving" refactor of a transform function, add characterization tests that hardcode the current output and run them green against the *original* code before you change a line. The test must fail if output drifts by a single byte. No output-pinning test = no behavior-preserving claim.

### Benchmark before trusting a multi-agent review's severity estimate

The todo's "200 mutations × 1-3ms × 50 posts = 10-30s of CPU / P1" was an unverified back-of-envelope. Actual measurement (`src/lib/__tests__/html-text.bench.ts`, `npm run bench`) showed single-digit milliseconds per post and ~1.5× speedup — not the seconds and 5-10× the estimate predicted. True severity was closer to P3 than P1. The performance-oracle's arithmetic compounded plausible-looking per-unit guesses into an alarming total.

**Rule:** Treat priority labels on performance todos in `todos/` as unproven until measured. Before accepting a P1/effort framing, write a bench that reproduces the hot path at realistic and stress sizes and report old-vs-new numbers. Adjust the work (and your urgency) to the measurement, and record the real numbers in the todo's Resolution so the next reader inherits ground truth instead of the estimate.

## Cross-references

- `docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md` — Most important prior art: the **same** function regressed before (#146/#147) because no test pinned its output. Its "Prevention" section (test in the same commit as the refactor; audit a function's *semantic role*, not just its imports) is directly applicable here.
- `todos/163-complete-p1-cheerio-after-n-dom-mutations-hot-loop.md` — The todo this doc resolves; carries the full resolution note and benchmark table.
- `todos/164-pending-p2-fetch-posts-blocks-event-loop-no-yielding.md` — Follow-up (`dependencies: ["163"]`): even after cutting the DOM mutations, the 50-post loop still blocks the event loop without yielding.
- `todos/147-complete-p1-extracttext-truncation-destroys-paragraph-breaks.md` / `todos/148-complete-p1-html-text-no-tests.md` / `todos/146-complete-p1-max-post-words-not-enforced-on-direct-api-callers.md` — Prior html-text fixes; the paragraph-break + word-cap contracts any rewrite must preserve.
- `src/lib/html-text.ts` — The fixed file (`BLOCK_TAGS`, `collectText`, `extractTextFromHtml`, `truncateTextToWords`).
- `src/lib/substack.ts:81` — Caller of `extractTextFromHtml`; line 82 builds the excerpt from the extracted text (the loose-text consumer).
- `src/app/api/curate/route.ts:40` — Caller of `truncateTextToWords` (the trust-boundary word cap).
- `src/lib/__tests__/html-text.test.ts` — 8 characterization tests pinning the output shape; `src/lib/__tests__/html-text.bench.ts` — `npm run bench` perf signal.
