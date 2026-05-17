---
status: pending
priority: p2
issue_id: "175"
tags: [code-review, testing, edge-case, unicode]
dependencies: []
---

# `html-text` Tests Miss Unicode, Whitespace-Only, And CRLF Edge Cases

## Problem Statement

The 13 test cases in `src/lib/__tests__/html-text.test.ts` cover the happy path well, but skip exactly the inputs most likely to expose regressions in a regex-driven implementation:

1. **Unicode words** — `'café résumé naïve'`. Confirms `\S+` and `lastIndexOf('. ')` handle non-ASCII without surprises.
2. **Whitespace-only input** — see #165. Currently silently returns the whitespace verbatim.
3. **CRLF line endings** — Substack posts can contain `\r\n` from copy-paste; the `\n{3,}` collapse and the `\n\n` block insertion never normalize CR.
4. **NBSP runs** — ` ` is the most common "extra space" in Substack output but `[ \t]{2,}` doesn't collapse it.
5. **Long single sentence with no `. `** — Twitter-style posts fall back to raw word slice with no walkback; the marker (when supplied) lands mid-word.
6. **Trailing whitespace before truncation** — input ends with `'…\n\n   '` then 4000 more words; the boundary computation should respect trimming.

Flagged by kieran-typescript-reviewer (P2; coverage-gap framing).

## Findings

**Location:** `src/lib/__tests__/html-text.test.ts`

## Proposed Solutions

### Option A: Add a focused edge-case suite (recommended)

```ts
describe('truncateTextToWords — edge cases', () => {
  it('whitespace-only input returns empty', () => { ... })
  it('handles Unicode words for word counting', () => { ... })
  it('normalizes CRLF before paragraph-break detection', () => { ... })
  it('collapses NBSP runs along with regular spaces', () => { ... })
  it('truncates a long URL or single token without crashing', () => { ... })
})
```

- Pros: Each test fails *now*, drives the fixes for #165, #166, #180.
- Cons: Some failures imply implementation changes (NBSP, CRLF), so this todo blocks on triaging those.
- Effort: Small.

### Option B: Skip; handle each edge case as it surfaces in production

- Pros: Avoids over-investment in tests.
- Cons: The reason this PR needed #146/#147/#148 was exactly that the test gap let regressions ship silently.
- Effort: None.

## Recommended Action

_Pending triage._ Option A, write tests as failing first — they document the contract decisions for #165, #166, #180.

## Technical Details

**Affected files:**
- `src/lib/__tests__/html-text.test.ts`

## Acceptance Criteria

- [ ] Whitespace-only input is covered (links to #165)
- [ ] Unicode word counting is verified
- [ ] CRLF and NBSP behaviors are explicitly tested (pass or document the choice)

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- Related: #165, #166, #180
