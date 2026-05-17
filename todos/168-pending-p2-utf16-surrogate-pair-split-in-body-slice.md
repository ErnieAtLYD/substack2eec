---
status: pending
priority: p2
issue_id: "168"
tags: [code-review, correctness, unicode]
dependencies: []
---

# `MAX_BODY_CHARS` Slice Can Split A UTF-16 Surrogate Pair, Producing A Lone Surrogate

## Problem Statement

`String.prototype.slice` operates on UTF-16 code units, not code points. `bodyText.slice(0, 15000)` will produce a lone high or low surrogate if char index 14_999 sits inside an emoji or any non-BMP character. The lone surrogate then flows into `truncateTextToWords` (whose `\S+` regex treats it as non-whitespace and keeps it), then into JSON.stringify (which encodes it as `\uD8XX`), then into the LLM prompt as garbage.

Not a security vulnerability — won't crash anything — but a correctness regression on emoji-rich posts.

Flagged by security-sentinel (P2).

## Findings

**Location:** `src/app/api/curate/route.ts:33`

```ts
(typeof p.bodyText === 'string' ? p.bodyText : '').slice(0, MAX_BODY_CHARS)
```

Same risk applies to any other `slice(0, N)` on attacker-controlled or user-content strings. Audit at: `src/lib/ai.ts:84-86` (`sanitizeForPrompt` uses `slice(0, 300)`) — same defect.

## Proposed Solutions

### Option A: Strip lone surrogates after slice (recommended)

```ts
const sliced = text.slice(0, MAX_BODY_CHARS).replace(/[\uD800-\uDFFF]/g, '')
```

Two-line change covering all `.slice(0, N)` sites.

- Pros: Cheap, surgical, handles all current and future slice sites with the same regex helper.
- Cons: Doesn't preserve the partial emoji — silently drops it.
- Effort: Trivial.

### Option B: Slice by code points instead of code units

```ts
const sliced = Array.from(text).slice(0, MAX_BODY_CHARS).join('')
```

- Pros: Always produces valid UTF-16; cleaner mental model.
- Cons: `Array.from` allocates a code-point array (2× memory peak). At 15K chars that's negligible; at 100K char Zod max it's ~200KB peak per post, manageable but not free.
- Effort: Trivial.

### Option C: Add a `safeSlice` helper

Centralize the fix as a utility used by every slice in the codebase:

```ts
export function safeSlice(s: string, max: number): string {
  if (s.length <= max) return s
  let end = max
  if (end > 0 && s.charCodeAt(end - 1) >= 0xD800 && s.charCodeAt(end - 1) <= 0xDBFF) end--
  return s.slice(0, end)
}
```

- Pros: Reusable, surgical (preserves the last full code point).
- Cons: One more module-level helper.
- Effort: Small.

## Recommended Action

_Pending triage._ Option A or C. Apply at every `.slice(0, N)` on user content (route + sanitizeForPrompt).

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts`
- `src/lib/ai.ts` (`sanitizeForPrompt`)
- Possibly a new `src/lib/safe-string.ts` for Option C

## Acceptance Criteria

- [ ] Slicing emoji-padded `bodyText` at exactly the surrogate boundary produces no lone surrogates
- [ ] Test fixture: input where char 14_999 is a high surrogate → no `\uD8XX` in output

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/app/api/curate/route.ts:33`
- MDN: [`String.prototype.slice`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/slice)
