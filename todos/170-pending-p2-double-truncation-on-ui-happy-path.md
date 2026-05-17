---
status: pending
priority: p2
issue_id: "170"
tags: [code-review, performance, optimization]
dependencies: []
---

# `/api/curate` Re-Truncates Already-Truncated `bodyText` On The UI Happy Path

## Problem Statement

The UI flow is: user → `/api/fetch-posts` (which calls `extractTextFromHtml` → `truncateTextToWords` per post) → user POSTs the result to `/api/curate` (which runs `truncateTextToWords` *again* on each post). The second pass is necessary as a trust-boundary defense for direct API callers (#146), but on the UI happy path it's pure waste.

For 50 posts × ~15K chars, the second `wordRe.exec` walk processes ~125K regex iterations per request — ~20-50ms of pure overhead on every UI curation.

Flagged by performance-oracle (P2).

## Findings

**Location:** `src/app/api/curate/route.ts:30-36`

The route can't trust client-supplied length, but it *can* trivially short-circuit when the input is already under the cap.

## Proposed Solutions

### Option A: Fast path inside `truncateTextToWords` (recommended)

```ts
export function truncateTextToWords(text: string, maxWords: number, marker = ''): string {
  // Fast path: if the input cannot possibly exceed maxWords, skip the regex walk.
  const FAST_PATH_CHARS = maxWords * 6   // upper bound for English-ish text
  if (text.length <= FAST_PATH_CHARS) {
    // Still need to verify; but for typical inputs we save the exec loop.
    // ...
  }
  // ... existing implementation
}
```

Wait — this isn't quite right. A more honest fast path: count words via a single `String#match`:

```ts
const wordCount = (text.match(/\S+/g) ?? []).length
if (wordCount <= maxWords) return text
```

`String#match` with a global regex is faster in V8 than the exec loop because it doesn't need the per-match RegExpExecArray allocation. For inputs under the cap (the UI happy path), this is one allocation + one walk vs. one walk + N allocations.

- Pros: ~2-3× faster on the under-cap path. Same O(n).
- Cons: Two allocations (one for the array, then one for the slice if truncating). For under-cap path the array allocation is the only extra cost.
- Effort: Trivial.

### Option B: Skip when input length is well under threshold

```ts
if (text.length < maxWords * 3) return text   // can't possibly have maxWords+1 words
```

- Pros: O(1) early exit, no regex.
- Cons: Threshold is heuristic — fails closed (still runs the regex if uncertain). Needs careful constant.
- Effort: Trivial.

### Option C: Don't optimize; the cost is small

20-50ms per request is negligible vs. the multi-second LLM call.

- Pros: Zero risk.
- Cons: Misses an easy win.
- Effort: None.

## Recommended Action

_Pending triage._ Combine A + B: the length check guards the regex walk; the regex walk is still correct in the truncate-needed path.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`

## Acceptance Criteria

- [ ] `truncateTextToWords` is measurably faster on under-cap inputs
- [ ] All existing tests still pass

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/lib/html-text.ts:40-69`
- `src/app/api/curate/route.ts:30-36`
