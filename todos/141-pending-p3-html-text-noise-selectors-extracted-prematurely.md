---
status: pending
priority: p3
issue_id: "141"
tags: [code-review, simplicity, yagni]
dependencies: []
---

# `NOISE_SELECTORS` Constant Is Premature DRY for One Call Site

## Problem Statement

`src/lib/html-text.ts` extracts the noise-selector array into a top-level `NOISE_SELECTORS` const that's `.join(', ')`-ed at module scope. Naming was justified when the list lived in two files; with one call site and one consumer, the array literal can move back inline. Extracting a const used once is premature.

## Findings

**Location:** `src/lib/html-text.ts:5-17,26`

Flagged P2 by code-simplicity-reviewer; performance-oracle confirmed there's no perf benefit to module-scope hoisting (cheerio re-parses the selector string every call regardless).

Current:
```ts
const NOISE_SELECTORS = [
  '.subscription-widget',
  '.share-widget',
  // ... 9 more
].join(', ')

// later:
$(NOISE_SELECTORS).remove()
```

## Proposed Solutions

### Option A: Inline the array literal at the call site

```ts
$([
  '.subscription-widget',
  '.share-widget',
  '.subscribe-widget',
  '.button-wrapper',
  '.captioned-button-wrap',
  '.tweet',
  'footer',
  'figure',
  '.footnote',
  'script',
  'style',
].join(', ')).remove()
```

- Pros: One fewer named symbol, locality of meaning (selectors live where they're used).
- Cons: Adds visual weight in `extractTextFromHtml`. Marginal.
- Effort: Small.

### Option B: Keep as-is

- Pros: Slightly cleaner function body.
- Cons: Premature abstraction — the const has one consumer in one file.
- Effort: Zero.

## Recommended Action

_Pending triage._ Filed P3 (down from simplicity reviewer's P2) because the cost is one named const, not a real complexity hit.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`

## Acceptance Criteria

- [ ] If accepted: `NOISE_SELECTORS` removed, array inlined at call site
- [ ] No behavior change (selector list unchanged)

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- code-simplicity-reviewer P2 finding (this review)
