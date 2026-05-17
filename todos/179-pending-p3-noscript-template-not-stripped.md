---
status: pending
priority: p3
issue_id: "179"
tags: [code-review, llm-input-quality, html-extraction]
dependencies: []
---

# `extractTextFromHtml` Does Not Strip `<noscript>` And `<template>` Content

## Problem Statement

`NOISE_SELECTORS` removes scripts, styles, figures, footers, subscribe widgets, etc. — but `<noscript>` and `<template>` are not in the list. `cheerio`'s `$('body').text()` returns text content from both, so any `<noscript>Please enable JavaScript</noscript>` ends up in the LLM prompt.

Substack output rarely contains these today, but the function is a generic shared utility (used by spike, future callers might pass arbitrary HTML).

Flagged by kieran-typescript-reviewer (P3).

## Findings

**Location:** `src/lib/html-text.ts:5-17` (`NOISE_SELECTORS`)

## Proposed Solutions

### Option A: Add to noise selectors (recommended)

```ts
const NOISE_SELECTORS = [
  ...,
  'noscript',
  'template',
  'aside',  // also worth considering
].join(', ')
```

- Pros: One-line fix.
- Cons: None.
- Effort: Trivial.

### Option B: Skip; not a real problem for Substack inputs

- Pros: Zero risk.
- Cons: Loses generality of the utility.
- Effort: None.

## Recommended Action

_Pending triage._ Option A.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`
- `src/lib/__tests__/html-text.test.ts` (extend the noise-selector test)

## Acceptance Criteria

- [ ] `<noscript>` and `<template>` content does not appear in extracted text

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/lib/html-text.ts:5-17`
