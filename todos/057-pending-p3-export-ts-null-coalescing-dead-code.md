---
status: pending
priority: p3
issue_id: "057"
tags: [code-review, simplicity]
dependencies: []
---

# `?? ''` Fallbacks in `buildReadme` Are Dead Code — Params Are Typed `string`

## Problem Statement

`buildReadme` in `src/lib/export.ts` applies `?? ''` null-coalescing to `courseTitle` and `courseDescription`, but the function signature types both as non-nullable `string`. The fallbacks are unreachable dead code that implies uncertainty about types that doesn't exist.

## Findings

**Location:** `src/lib/export.ts:10-11`

```typescript
export function buildReadme(
  courseTitle: string,       // non-nullable
  courseDescription: string, // non-nullable
  lessons: GeneratedLesson[],
): string {
  const safeTitle = (courseTitle ?? '').slice(0, 200)        // ?? '' unreachable
  const safeDescription = (courseDescription ?? '').slice(0, 1000)  // ?? '' unreachable
```

TypeScript will never allow `null` or `undefined` to reach this function given the signature. The `?? ''` implies the function tolerates undefined but the types say it doesn't.

If the concern is defensive coding for callers that bypass TypeScript types at runtime, the right fix is to either change the signature to `string | undefined` or remove the guards and document that the function requires non-empty strings.

## Proposed Solution

Option A (remove dead code — types are authoritative):
```typescript
const safeTitle = courseTitle.slice(0, 200)
const safeDescription = courseDescription.slice(0, 1000)
```

Option B (fix types to match intent):
```typescript
export function buildReadme(
  courseTitle: string | undefined,
  courseDescription: string | undefined,
  ...
```
And keep the `?? ''`.

## Recommended Action

Option A if the export route always passes non-null strings (which it does: `courseTitle ?? 'Email Course'` is applied at the call site in the export route). Option B if `buildReadme` needs to be more broadly defensive.

## Technical Details

**Affected file:** `src/lib/export.ts:10-11`

## Acceptance Criteria

- [ ] Either `?? ''` removed (Option A) or type signature updated (Option B)
- [ ] No dead code path remains

## Work Log

- 2026-03-29: Found during code simplicity review of batch fixes (round 2)
