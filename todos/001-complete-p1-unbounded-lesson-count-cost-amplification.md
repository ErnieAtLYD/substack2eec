---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, security, api-validation]
dependencies: []
---

# Unbounded `lessonCount` Enables Cost Amplification / DoS

## Problem Statement

The `/api/curate` route accepts any positive integer for `lessonCount`, with no upper bound or allowlist check. An anonymous caller can send `lessonCount: 999` and Claude will attempt to curate 999 lessons (`maxItems: 999` in the tool schema) and rewrite each one in sequence — each rewrite consuming up to 2048 output tokens. With no authentication on the route, this is a trivially exploitable financial DoS vector against the Anthropic API account.

**Why it matters:** The app has no auth layer. Any attacker with curl can send `lessonCount: 500` and run up hundreds of dollars in API costs. This is introduced directly by this PR: the constant `5` was safe; the user-supplied value is not.

## Findings

**Location:** `src/app/api/curate/route.ts:30-32`

Current code:
```typescript
const lessonCount = typeof body.lessonCount === 'number' && body.lessonCount > 0
  ? body.lessonCount
  : 5
```

- Accepts `lessonCount: 999`, `lessonCount: 50000`, `lessonCount: 5.9` (floats too, since `typeof 5.9 === 'number'`)
- The value flows directly into `buildCurationTool(lessonCount)` as `maxItems` and `maximum`
- Also interpolated into the curation prompt: `"Select exactly ${lessonCount} posts"`
- `rewriteAsLesson` is called once per selected lesson — each is a separate Anthropic API call

**Pre-existing or new?** New — introduced by this PR (previously hardcoded to 5).

## Proposed Solutions

### Option A: Allowlist check (Recommended)
```typescript
const ALLOWED_LESSON_COUNTS = new Set([3, 5, 7, 10])
const lessonCount = ALLOWED_LESSON_COUNTS.has(body.lessonCount) && Number.isInteger(body.lessonCount)
  ? body.lessonCount
  : 5
```
- **Pros:** One-line fix, closes both the DoS vector and float injection, matches the UI contract
- **Cons:** Silent fallback to 5 vs. explicit rejection — but consistent with existing behavior for missing values
- **Effort:** Small
- **Risk:** None

### Option B: Allowlist + explicit 400 rejection
```typescript
const ALLOWED_LESSON_COUNTS = [3, 5, 7, 10] as const
if (body.lessonCount !== undefined && !ALLOWED_LESSON_COUNTS.includes(body.lessonCount)) {
  return new Response(JSON.stringify({ error: 'lessonCount must be one of: 3, 5, 7, 10' }), { status: 400 })
}
const lessonCount = ALLOWED_LESSON_COUNTS.includes(body.lessonCount) ? body.lessonCount : 5
```
- **Pros:** Explicit contract, agent-friendly error message
- **Cons:** Breaking change for callers silently relying on fallback behavior
- **Effort:** Small
- **Risk:** Low

### Option C: Add `ALLOWED_LESSON_COUNTS` constant to `src/types/index.ts`
Export the constant from types so it's shared between route validation and the UI picker:
```typescript
export const ALLOWED_LESSON_COUNTS = [3, 5, 7, 10] as const
export type LessonCount = typeof ALLOWED_LESSON_COUNTS[number]
```
Then reference in route.ts and ReviewForm.tsx.
- **Pros:** Single source of truth, prevents drift
- **Effort:** Small-Medium
- **Risk:** None

## Recommended Action

Option A as an immediate fix (one line), with Option C bundled in the same PR to centralize the constant.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts:30-32` — validation logic
- `src/types/index.ts:50` — `lessonCount: number` type (should become `LessonCount`)
- `src/components/features/ReviewForm.tsx:297` — inline `[3, 5, 7, 10]` literal

**Components affected:** API route, AI lib (via `buildCurationTool`)

## Acceptance Criteria

- [ ] `lessonCount: 999` is rejected or silently clamped to 5
- [ ] `lessonCount: 5.9` is rejected or silently clamped to 5
- [ ] `lessonCount: 5` (valid) continues to work
- [ ] `lessonCount` missing from body falls back to 5 (existing behavior preserved)
- [ ] `ALLOWED_LESSON_COUNTS` constant is defined in one place and reused

## Work Log

- 2026-03-18: Finding created from code review of PR #1 (feat/custom-course-length)

## Resources

- PR #1: feat: custom course length picker
- Security reviewer finding: "Unbounded lessonCount: Cost Amplification / DoS"
- TypeScript reviewer finding: "P2-1 No server-side validation of lessonCount against the allowed set"
