---
status: pending
priority: p3
issue_id: "180"
tags: [code-review, llm-input-quality, html-extraction, unicode]
dependencies: []
---

# `extractTextFromHtml` Does Not Collapse NBSP (` `) Runs

## Problem Statement

`text.replace(/[ \t]{2,}/g, ' ')` collapses regular spaces and tabs but not NBSP (` `). Substack output frequently contains NBSP runs around bullet points, figure captions, and inline formatting. The result is awkward LLM input like `"first bullet   second bullet"`.

Flagged by kieran-typescript-reviewer (P3).

## Findings

**Location:** `src/lib/html-text.ts:31`

```ts
const text = $('body').text()
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]{2,}/g, ' ')   // ← misses  
  .trim()
```

## Proposed Solutions

### Option A: Include NBSP in the whitespace class (recommended)

```ts
.replace(/[ \t ]{2,}/g, ' ')
```

- Pros: One-character fix (well, three).
- Cons: Still doesn't handle other Unicode whitespace (` - `, `　`); but those are vanishingly rare in Substack content.
- Effort: Trivial.

### Option B: Normalize NBSP → space before the collapse

```ts
const text = $('body').text()
  .replace(/ /g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]{2,}/g, ' ')
  .trim()
```

- Pros: Most explicit; readable.
- Cons: One extra pass.
- Effort: Trivial.

### Option C: Collapse all Unicode whitespace except `\n`

```ts
.replace(/[^\S\n]{2,}/g, ' ')
```

- Pros: Catches NBSP, em space, ideographic space.
- Cons: `[^\S\n]` requires careful reading; less obvious intent.
- Effort: Trivial.

## Recommended Action

_Pending triage._ Option B for clarity, or Option C for completeness.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`
- `src/lib/__tests__/html-text.test.ts` (add NBSP test, ties into #175)

## Acceptance Criteria

- [ ] NBSP runs are collapsed in extracted text
- [ ] Existing tests still pass

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/lib/html-text.ts:31`
- Related: #175 (test coverage for Unicode whitespace)
