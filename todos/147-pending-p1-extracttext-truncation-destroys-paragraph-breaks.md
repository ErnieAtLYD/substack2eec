---
status: pending
priority: p1
issue_id: "147"
tags: [code-review, quality, llm-input, html-extraction]
dependencies: []
---

# `extractTextFromHtml` Truncation Path Destroys Paragraph Breaks

## Problem Statement

`extractTextFromHtml` carefully inserts `\n\n` after every block element so the extracted text retains paragraph structure. The truncation branch then `split(/\s+/)` on the text and `.join(' ')` on the slice — which collapses `\n\n` into single spaces. So a post **above** `MAX_POST_WORDS` reaches the LLM as a flat wall of text with no paragraph breaks, while a post **under** the cap retains its breaks. The LLM gets inconsistent input shape across the two paths, and the most expensive long posts lose the cleanest signal.

CLAUDE.md explicitly notes "LLM context is the dominant cost; this code is preprocessing." Quality regression on the inputs that matter most.

## Findings

**Location:** `src/lib/html-text.ts:35-46`

```ts
const words = text.split(/\s+/)            // \n\n becomes ordinary whitespace, not a separator
if (words.length <= MAX_POST_WORDS) return text
let candidate = words.slice(0, MAX_POST_WORDS).join(' ')   // re-joined with spaces, paragraph breaks gone
```

Flagged by performance-oracle (P1) as a correctness/quality issue, not a speed issue.

## Proposed Solutions

### Option A: Truncate by walking word boundaries in the original string

Use a regex `\S+` cursor to find the nth word boundary without splitting/joining, then slice the original `text`:

```ts
let count = 0, idx = text.length
const re = /\S+/g
let m: RegExpExecArray | null
while ((m = re.exec(text)) !== null) {
  count++
  if (count > MAX_POST_WORDS) { idx = m.index; break }
}
if (idx === text.length) return text
let candidate = text.slice(0, idx).trimEnd()
// then walk back to last sentence boundary as before
```

- Pros: Preserves `\n\n` paragraph breaks in truncated output. Avoids allocating an N-element word array.
- Cons: Slightly less straightforward to read.
- Effort: Small.

### Option B: Track paragraph offsets and rejoin with `\n\n`

Split into paragraphs first, count words within paragraphs, drop whole paragraphs after the cap.

- Pros: Even cleaner LLM input — never cuts mid-paragraph.
- Cons: Different truncation behavior; needs UX/quality validation.
- Effort: Medium.

## Recommended Action

_Pending triage._ Option A is the minimum fix; Option B is a quality upgrade.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`

Test case to lock behavior in: a 5,000-word HTML body with paragraph tags should, after extraction, contain `\n\n` separators in the truncated output.

## Acceptance Criteria

- [ ] Truncated output retains `\n\n` paragraph separators
- [ ] Test asserts at least one `\n\n` appears in truncated output for a multi-paragraph >2,500-word fixture
- [ ] Existing untruncated path unaffected

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- performance-oracle review (this review)
- `src/lib/substack.ts:82` — `excerpt` derivation depends on this paragraph structure
