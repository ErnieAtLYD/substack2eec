---
status: pending
priority: p2
issue_id: "165"
tags: [code-review, correctness, edge-case]
dependencies: []
---

# `truncateTextToWords` Returns Whitespace-Only Input Verbatim Instead Of Empty String

## Problem Statement

`truncateTextToWords('   \n\n   ', N)` returns `'   \n\n   '` because `wordRe.exec` finds no `\S+` matches → `cutIndex === -1` → early return with original string. That whitespace blob then flows into the LLM prompt as a "post body."

Not exploitable, but a correctness bug: the function's contract implies "returns text fit for prompt embedding," and a whitespace-only return value violates that. The same path also bypasses any caller that distinguishes "non-empty body" from "empty body."

Flagged by kieran-typescript-reviewer (P2).

## Findings

**Location:** `src/lib/html-text.ts:51-56`

```ts
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
if (cutIndex === -1) return text   // ← bug: returns whitespace verbatim
```

The existing test at `src/lib/__tests__/html-text.test.ts:90-92` only covers `''` (truly empty). Whitespace-only is uncovered.

## Proposed Solutions

### Option A: Trim before the early return (recommended)

```ts
if (cutIndex === -1) return text.trim()
```

- Pros: One-line fix. Aligns with caller intent.
- Cons: Subtly changes the "no truncation needed" return value for inputs with leading/trailing whitespace. Probably desirable.
- Effort: Trivial.

### Option B: Return empty when zero word matches

```ts
if (count === 0) return ''
if (cutIndex === -1) return text
```

- Pros: Most explicit.
- Cons: Two returns; slightly more code.
- Effort: Trivial.

### Option C: Trim once at function entry

```ts
text = text.trim()
```

- Pros: Cleanest contract: "I always return a trimmed result."
- Cons: Changes behavior for already-trimmed inputs (no-op) and for inputs with intentional leading whitespace (none expected).
- Effort: Trivial.

## Recommended Action

_Pending triage._ Option C is most defensive. Add the failing test first, then fix.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`
- `src/lib/__tests__/html-text.test.ts` (add: whitespace-only returns empty; trimmed-leading-whitespace test)

## Acceptance Criteria

- [ ] `truncateTextToWords('   \n\n   ', 5)` returns `''`
- [ ] No regression on other tests

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/lib/html-text.ts:51-56`
- Related: #166 (sentence-boundary edge cases — same function)
