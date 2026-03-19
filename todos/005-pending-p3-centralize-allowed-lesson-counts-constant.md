---
status: pending
priority: p3
issue_id: "005"
tags: [code-review, typescript, architecture, dry]
dependencies: [001]
---

# Centralize `ALLOWED_LESSON_COUNTS` Constant and `LessonCount` Union Type

## Problem Statement

The allowed lesson count values `[3, 5, 7, 10]` appear as an inline JSX literal in `ReviewForm.tsx` and are not defined anywhere on the server. If a value is added or removed, it must be updated in the JSX, in the server validation (once #001 is fixed), and in any future type definitions — with no compile-time guard against drift.

**Why it matters:** Single source of truth. Multiple agents flagged this (TypeScript reviewer, architecture strategist, agent-native reviewer). Fixing #001 requires defining the constant on the server anyway — this ensures they're the same constant.

## Findings

**Location 1:** `src/components/features/ReviewForm.tsx:297`
```tsx
{[3, 5, 7, 10].map(n => (
```
Inline literal with no reference to any shared definition.

**Location 2:** `src/types/index.ts:50`
```typescript
lessonCount: number
```
Wide type that doesn't express the constraint.

**Pre-existing or new?** Introduced by this PR — the hardcoded `5` had no such divergence risk.

## Proposed Solutions

### Option A: Export constant + derived union type from `src/types/index.ts` (Recommended)
```typescript
// src/types/index.ts
export const ALLOWED_LESSON_COUNTS = [3, 5, 7, 10] as const
export type LessonCount = typeof ALLOWED_LESSON_COUNTS[number]  // 3 | 5 | 7 | 10

export interface CurateRequest {
  posts: SubstackPost[]
  lessonCount?: LessonCount  // optional, server defaults to 5
}
```

Then in `ReviewForm.tsx`:
```tsx
import { ALLOWED_LESSON_COUNTS, LessonCount } from '@/types'
const [lessonCount, setLessonCount] = useState<LessonCount>(5)
// ...
{ALLOWED_LESSON_COUNTS.map(n => (
```

And in `route.ts`:
```typescript
import { ALLOWED_LESSON_COUNTS, LessonCount } from '@/types'
const lessonCount: LessonCount = (ALLOWED_LESSON_COUNTS as readonly number[]).includes(body.lessonCount)
  ? body.lessonCount as LessonCount
  : 5
```
- **Pros:** Single source of truth; TypeScript enforces the constraint end-to-end; no drift possible
- **Effort:** Small (touches 3 files, but changes are mechanical)
- **Risk:** None

### Option B: Define constant in `src/lib/ai.ts` only (server-side)
Keep the UI literal as-is, only centralize on the server where validation needs it.
- **Pros:** Minimal change
- **Cons:** Still two sources of truth; no TypeScript contract for the UI
- **Effort:** Tiny
- **Risk:** None

## Recommended Action

Option A — export from `src/types/index.ts` as the shared contract layer. Best done as part of fixing #001 (allowlist validation) so both changes land together.

## Technical Details

**Affected files:**
- `src/types/index.ts` — add constant + type
- `src/components/features/ReviewForm.tsx` — import and use constant
- `src/app/api/curate/route.ts` — import and use for validation

## Acceptance Criteria

- [ ] `ALLOWED_LESSON_COUNTS` defined in one place only
- [ ] `LessonCount` type used on `CurateRequest.lessonCount`
- [ ] UI picker uses `ALLOWED_LESSON_COUNTS` to render options
- [ ] Server validation uses `ALLOWED_LESSON_COUNTS` to check input

## Work Log

- 2026-03-18: Finding created from code review of PR #1 (feat/custom-course-length)

## Resources

- PR #1: feat: custom course length picker
- Architecture strategist finding: "P3-A Centralize the allowed-values constant"
- TypeScript reviewer finding: "P2-1 narrow the type to a union"
- Agent-native reviewer: "Allowed values not enforced or documented at API boundary"
