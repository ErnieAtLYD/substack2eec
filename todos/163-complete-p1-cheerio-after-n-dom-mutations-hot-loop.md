---
status: complete
priority: p1
issue_id: "163"
tags: [code-review, performance, cheerio, hot-path]
dependencies: []
---

# `extractTextFromHtml` Performs N Cheerio DOM Mutations Per Post On Every Fetch

## Problem Statement

`$('p, h1, h2, h3, h4, li').after('\n\n')` at `src/lib/html-text.ts:30` is the dominant cost of HTML extraction. For a 50-paragraph post that's 50 separate cheerio insertions; for a list-heavy "cookbook" post (200+ list items) it's 200+ DOM mutations per post, each invoking parse5-style serialization logic.

`/api/fetch-posts` calls this up to 50 times per request. Rough back-of-envelope: 200 mutations × 1-3ms × 50 posts = **10-30 seconds of CPU**, all synchronous, on the request thread of a Node serverless function. This dwarfs every other cost in the PR — including the cheerio parse itself.

Flagged by performance-oracle (P1).

## Findings

**Location:** `src/lib/html-text.ts:30`

```ts
$('p, h1, h2, h3, h4, li').after('\n\n')
```

The mutation isn't needed; the goal is "preserve paragraph breaks in the extracted text." That can be achieved with one tree walk and zero mutations.

## Proposed Solutions

### Option A: Walk the tree once, build text directly (recommended)

```ts
const parts: string[] = []
$('p, h1, h2, h3, h4, li').each((_, el) => {
  parts.push($(el).text(), '\n\n')
})
const text = parts.join('')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]{2,}/g, ' ')
  .trim()
```

- Pros: Single pass, no DOM mutation. Likely 5-10× faster on list-heavy posts. Same output shape.
- Cons: Skips text content outside the matched selectors (loose `<div>` text, footnotes that survived noise removal, etc.). Need to verify against current snapshot tests.
- Effort: Small. Add a regression test against a sampled real Substack post.

### Option B: Append text nodes via parse5 instead of cheerio's HTML reparser

```ts
$('p, h1, h2, h3, h4, li').each((_, el) => {
  el.children.push({ type: 'text', data: '\n\n' } as any)
})
```

- Pros: Keeps current logic shape, avoids HTML-string reparse on each `.after()`.
- Cons: Reaches into cheerio internals; brittle across versions.
- Effort: Small.

### Option C: Replace `\n\n` insertion with sentinel substitution

Insert sentinel string via `outerHTML` rewrite, then substitute on the final text:

```ts
const html2 = html.replace(/<\/(p|h[1-4]|li)>/gi, '\n\n</$1>')
// then continue with $.load(html2) ...
```

- Pros: Zero cheerio mutations. Pure string op before parse.
- Cons: Regex-on-HTML is fragile; misses self-closed or attribute-laden close tags. Probably rejected.
- Effort: Trivial but risky.

## Recommended Action

_Pending triage._ Option A. Verify with a few real Substack post fixtures before merging.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`
- `src/lib/__tests__/html-text.test.ts` (add a "list-heavy post" case to lock the output shape and serve as a perf canary)

**Benchmark target:** measure extract time on a 200-item list post before/after. Expect ≥5× speedup.

## Acceptance Criteria

- [ ] No DOM mutation inside `extractTextFromHtml`
- [x] No DOM mutation inside `extractTextFromHtml`
- [x] Existing html-text tests still pass (138 → 146 total; 8 characterization cases added)
- [x] A "list-heavy post" fixture extracts in <50ms (sanity bound) — 0.37ms @ 200 items, 7.5ms @ 4000 items
- [x] `/api/fetch-posts` measurable latency improvement — 1.4–1.8× on list-heavy posts

## Resolution

Fixed test-first (per CLAUDE.md). Implemented a variant of Option A that **does not**
have the loose-text bug the original Option A would have introduced.

**Approach:** replaced `$('p, h1, h2, h3, h4, li').after('\n\n')` + `$('body').text()`
with a single depth-first walk (`collectText`) over the parsed body subtree. It pushes
every text node (so loose text outside the block selectors is still captured — the
contract `src/lib/substack.ts:82` excerpting depends on) and appends `\n\n` post-order
after each `BLOCK_TAGS` element. Zero DOM mutation, no HTML reparse, byte-identical output.

**Correction to this todo:** the proposed Option A ("walk matched selectors, join their
`.text()`") was **wrong** — it would silently drop loose `<div>`/blockquote/anchor text
that `$('body').text()` captures today. 8 characterization tests were written and shown to
pass against the *unchanged* implementation first, then the refactor was verified to keep
them green (lock-then-refactor).

**Measured impact — the P1 framing was overstated.** The original estimate ("200 mutations
× 1-3ms × 50 posts = 10-30s of CPU") was an unverified back-of-envelope. Real benchmarks
(`src/lib/__tests__/html-text.bench.ts`, `npm run bench`):

| items | new (walk) | old (`.after`) | speedup |
|------:|----------:|---------------:|--------:|
| 200   | 0.57ms    | 0.77ms         | 1.36×   |
| 1000  | 1.83ms    | 2.87ms         | 1.57×   |
| 2000  | 3.77ms    | 5.83ms         | 1.55×   |
| 4000  | 7.48ms    | 13.18ms        | 1.76×   |

Per-post cost is single-digit milliseconds, not seconds; the old path is mildly
superlinear (gap widens with size), the new walk is closer to linear. Real impact is
**~1.5×**, not the 5–10× predicted. Still a worthwhile correctness-preserving win that
removes the O(n)-mutation pattern, but the true severity was closer to P3 than P1. Kept the
`p1` in the filename for issue-ID continuity.

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.
_2026-06-03:_ Fixed via zero-mutation single-walk rewrite. Characterization tests +
vitest bench added. See measured impact above.

## Resources

- `src/lib/html-text.ts` — `collectText` walk + `extractTextFromHtml`
- `src/lib/__tests__/html-text.test.ts` — 8 characterization tests pinning output shape
- `src/lib/__tests__/html-text.bench.ts` — `npm run bench` perf signal
- Related: #164 (event-loop yielding — separate issue, but compounds with this one)
- Prior regression of this same function: `docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md`
