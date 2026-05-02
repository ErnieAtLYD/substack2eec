---
status: pending
priority: p3
issue_id: "142"
tags: [code-review, simplicity, yagni]
dependencies: [140]
---

# `TRUNCATION_MARKER` Constant in Spike Is Inline-able

## Problem Statement

`spike/extract.ts` defines `const TRUNCATION_MARKER = '\n\n[truncated]'` and uses it in exactly two places (the call to `extractTextFromHtml` and the `endsWith` check). For a 110-line single-purpose script, naming the literal adds indirection without payoff.

## Findings

**Location:** `spike/extract.ts:13,91,93`

Flagged P2 by code-simplicity-reviewer. Filed P3 because the const is small, harmless, and arguably aids the matching `endsWith` invariant. If todo #140 lands first (positional `truncationMarker` param), the inlined form becomes even cleaner.

Current:
```ts
const TRUNCATION_MARKER = '\n\n[truncated]'
// ...
const extracted = extractTextFromHtml(post.body_html, { truncationMarker: TRUNCATION_MARKER })
const wasTruncated = extracted.endsWith(TRUNCATION_MARKER)
```

After #140 + this todo:
```ts
const extracted = extractTextFromHtml(post.body_html, '\n\n[truncated]')
const wasTruncated = extracted.endsWith('[truncated]')
```

## Proposed Solutions

### Option A: Inline the literal both places

- Pros: 2 LOC saved, reads fine; the spike is throwaway/diagnostic code.
- Cons: If the marker ever changed, two edits instead of one.
- Effort: Small.

### Option B: Keep the const

- Pros: Single source of truth for the marker string.
- Cons: Indirection cost for a single 2-use case in a script.
- Effort: Zero.

## Recommended Action

_Pending triage._ Best done together with #140.

## Technical Details

**Affected files:**
- `spike/extract.ts`

## Acceptance Criteria

- [ ] If accepted: `TRUNCATION_MARKER` const removed
- [ ] Both call sites use the literal
- [ ] `tsx spike/extract.ts <url> 2` still produces a `(truncated from N)` line for a long post

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- Depends on triage outcome of todo #140
