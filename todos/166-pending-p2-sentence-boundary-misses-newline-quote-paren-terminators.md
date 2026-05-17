---
status: pending
priority: p2
issue_id: "166"
tags: [code-review, llm-input-quality, correctness]
dependencies: []
---

# `truncateTextToWords` Sentence-Boundary Walkback Misses Common Terminators (`.\n`, `."`, `.)`)

## Problem Statement

`truncateTextToWords` walks back from the cut point to the last sentence boundary using:

```ts
const lastSentenceEnd = Math.max(
  candidate.lastIndexOf('. '),
  candidate.lastIndexOf('! '),
  candidate.lastIndexOf('? '),
)
```

Three patterns. All require a literal trailing space. After `extractTextFromHtml` inserts `\n\n` between block elements, sentences ending at a paragraph boundary look like `text.\n\nNext paragraph` — no `. ` substring at that position. The walkback misses them and falls through to the raw word-slice mid-sentence.

Substack posts almost universally end paragraphs with sentences; the walkback misses the **most common** sentence boundary in extracted text. The truncation marker is then appended mid-sentence, which is exactly the input shape the walkback was designed to avoid.

Flagged by kieran-typescript-reviewer (P2).

## Findings

**Location:** `src/lib/html-text.ts:60-64`

Misses: `.\n`, `.\n\n`, `."`, `.)`, `.]`, `.”`, `?"`, `!)`, etc.

Hits only: `. `, `! `, `? `

## Proposed Solutions

### Option A: Use a regex against the candidate (recommended)

```ts
const m = candidate.match(/[.!?]["'’”)\]]?(?=\s|$)/g)
if (m) {
  const lastTerminator = m[m.length - 1]
  const idx = candidate.lastIndexOf(lastTerminator)
  candidate = candidate.slice(0, idx + lastTerminator.length)
}
```

- Pros: Catches `.\n`, `."`, `.)`, smart quotes.
- Cons: Building the regex match list scales linearly; for ~15K char candidates this is fine.
- Effort: Small.

### Option B: Reverse-scan once for any terminator

Walk `candidate` backward; stop at first index `i` where `candidate[i]` is `.!?` and the next char (or end) is whitespace / closing quote / paren.

- Pros: O(n) worst case, typically O(short).
- Cons: More code; harder to read than Option A.
- Effort: Small-medium.

### Option C: Accept current behavior, add an explicit "best-effort" comment

If the LLM-input quality cost is small, document that the walkback is heuristic and only handles `. ` etc.

- Pros: Zero risk.
- Cons: Doesn't fix the regression. Long-form Substack content frequently truncates mid-sentence.
- Effort: Trivial.

## Recommended Action

_Pending triage._ Option A. Add tests for `.\n`, `."`, `.)` cases first.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`
- `src/lib/__tests__/html-text.test.ts`

## Acceptance Criteria

- [ ] `truncateTextToWords('First.\n\nSecond. Third.', 2)` keeps `'First.'`
- [ ] `truncateTextToWords('"Quote." Next.', 2)` keeps `'"Quote."'`
- [ ] No regression on existing 13 tests

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/lib/html-text.ts:60-64`
- Related: #165 (whitespace-only input — same function)
