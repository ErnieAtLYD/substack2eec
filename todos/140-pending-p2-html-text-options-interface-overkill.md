---
status: pending
priority: p2
issue_id: "140"
tags: [code-review, simplicity, yagni, api-design]
dependencies: []
---

# `ExtractTextOptions` Interface Is Premature for One Optional Flag

## Problem Statement

`src/lib/html-text.ts` exports an `ExtractTextOptions` interface with a single optional field `truncationMarker?: string`. For one optional argument, an interface + `options` object + `?? ''` indirection is YAGNI. A positional optional parameter is shorter, clearer, and one fewer exported symbol.

## Findings

**Location:** `src/lib/html-text.ts:19-23,48`

Flagged P1 by code-simplicity-reviewer (textbook premature generalization) and acknowledged P3 by kieran-typescript-reviewer. Filed P2 because it's worth fixing before the API hardens, but does not block merge.

Current shape:
```ts
export interface ExtractTextOptions {
  truncationMarker?: string
}
export function extractTextFromHtml(html: string, options: ExtractTextOptions = {}): string {
  // ...
  return candidate + (options.truncationMarker ?? '')
}
```

Caller:
```ts
extractTextFromHtml(post.body_html, { truncationMarker: TRUNCATION_MARKER })
```

## Proposed Solutions

### Option A: Positional optional parameter (recommended)

```ts
export function extractTextFromHtml(html: string, truncationMarker = ''): string {
  // ...
  return candidate + truncationMarker
}
```

Caller becomes:
```ts
extractTextFromHtml(post.body_html, TRUNCATION_MARKER)
```

- Pros: ~5 LOC saved, no exported `ExtractTextOptions` symbol, no `?? ''`, direct concatenation reads naturally.
- Cons: If a second option is ever added, this requires a small breaking change (or a second positional param). Acceptable — YAGNI says wait.
- Effort: Small.

### Option B: Discriminated return (kieran-ts P3#3)

```ts
export function extractTextFromHtml(html: string): { text: string; truncated: boolean }
```

Spike formats its own `[truncated]` suffix from the flag.

- Pros: Pushes "was truncated?" into the type system instead of `endsWith` string-sniffing in the spike.
- Cons: Forces every caller to destructure even though `substack.ts` only wants `.text`. Heavier change for less win in a 2-caller world.
- Effort: Medium.

### Option C: Leave as-is

- Pros: Zero churn.
- Cons: Carries an exported interface paid for by no-one.
- Effort: Zero.

## Recommended Action

_Pending triage._ Option A aligns with the simplicity reviewer's bias toward delete-over-abstract.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`
- `spike/extract.ts`

## Acceptance Criteria

- [ ] `ExtractTextOptions` interface deleted
- [ ] `extractTextFromHtml` takes positional `truncationMarker = ''`
- [ ] Spike call site updated
- [ ] `tsc --noEmit` passes
- [ ] All vitest tests pass

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- code-simplicity-reviewer P1 finding (this review)
- kieran-typescript-reviewer P3#3 (alternative Option B)
