---
status: pending
priority: p2
issue_id: "152"
tags: [code-review, architecture, refactor]
dependencies: []
---

# `parseSSEStream` Exported From `'use client'` Component File

## Problem Statement

`parseSSEStream` is a pure async generator with no React dependency, but it is defined and exported from `src/components/features/ReviewForm.tsx` — a `'use client'` file. Anyone importing `parseSSEStream` from another module drags the client-component boundary along. The code comment on the export already calls this out as test-only.

The same instinct that drove the `html-text.ts` extraction applies here: pure logic belongs in a pure module.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:84-101` (definition + export)

Flagged by kieran-typescript-reviewer (P2-5).

## Proposed Solutions

### Option A: Extract to `src/components/features/sseStream.ts` (no `'use client'`)

`ReviewForm.tsx` imports it. `parseSSEStream.test.ts` imports it directly. Nothing else references it.

- Pros: Pure module is freely importable; matches the precedent set by `html-text.ts`.
- Cons: One new file.
- Effort: Small.

### Option B: Extract to `src/lib/sse.ts`

Same idea, in `lib/`. Note this would need to skip `'server-only'` since it runs on the client (`TextDecoder`, `ReadableStreamDefaultReader`).

- Pros: More canonical home for shared utilities.
- Cons: Conflicts with the `src/lib/ = server-only` convention; requires either a carve-out (similar to #139) or a different home.
- Effort: Small.

## Recommended Action

_Pending triage._ Option A — keep client-only utilities under `src/components/`.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx`
- `src/components/features/sseStream.ts` (new)
- `src/components/features/__tests__/parseSSEStream.test.ts`

## Acceptance Criteria

- [ ] `parseSSEStream` lives in a non-`'use client'` file
- [ ] Test imports from the new module path
- [ ] `ReviewForm.tsx` imports `parseSSEStream` rather than defining it

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.
