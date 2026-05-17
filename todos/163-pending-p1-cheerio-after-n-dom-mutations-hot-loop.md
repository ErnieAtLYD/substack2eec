---
status: pending
priority: p1
issue_id: "163"
tags: [code-review, performance, cheerio, hot-path]
dependencies: []
---

# `extractTextFromHtml` Performs N Cheerio DOM Mutations Per Post On Every Fetch

## Problem Statement

`$('p, h1, h2, h3, h4, li').after('\n\n')` at `src/lib/html-text.ts:28` is the dominant cost of HTML extraction. For a 50-paragraph post that's 50 separate cheerio insertions; for a list-heavy "cookbook" post (200+ list items) it's 200+ DOM mutations per post, each invoking parse5-style serialization logic.

`/api/fetch-posts` calls this up to 50 times per request. Rough back-of-envelope: 200 mutations × 1-3ms × 50 posts = **10-30 seconds of CPU**, all synchronous, on the request thread of a Node serverless function. This dwarfs every other cost in the PR — including the cheerio parse itself.

Flagged by performance-oracle (P1).

## Findings

**Location:** `src/lib/html-text.ts:28`

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
- [ ] Existing 13 html-text tests still pass
- [ ] A "list-heavy post" fixture extracts in <50ms (sanity bound)
- [ ] `/api/fetch-posts` measurable latency improvement on real Substack inputs

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/lib/html-text.ts:28` — current implementation
- Related: #164 (event-loop yielding — separate issue, but compounds with this one)
