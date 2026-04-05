---
status: pending
priority: p2
issue_id: "090"
tags: [code-review, simplicity, dead-code, typescript]
dependencies: []
---

# `ProposeCoursesResponse` Interface Unused — Dead Type

## Problem Statement

`ProposeCoursesResponse` was added to `src/types/index.ts:57–59` but is never imported anywhere in the codebase. The route returns `{ candidates }` inline and the client reads `data.candidates` without type annotation. The interface adds zero safety today.

## Findings

- `src/types/index.ts:57–59` — `ProposeCoursesResponse` defined but never imported
- `src/app/api/propose-courses/route.ts` — returns `NextResponse.json({ candidates })` without using the type
- `src/components/features/ReviewForm.tsx` — reads `data.candidates` untyped

**Source:** Simplicity reviewer

## Proposed Solutions

### Option A — Use it in the route's return type annotation (Recommended)
```ts
return NextResponse.json<ProposeCoursesResponse>({ candidates })
```
This makes the type load-bearing and ensures the response shape is checked.

**Effort:** Trivial | **Risk:** None

### Option B — Delete it
If the type is never used and there's no plan to add typed fetch wrappers, delete it to avoid dead code.

**Effort:** Trivial | **Risk:** None

## Recommended Action

Option A — use it in the route; it's already there, just not wired up.

## Technical Details

**Affected files:**
- `src/app/api/propose-courses/route.ts` (use the type)
- OR `src/types/index.ts` (delete if unused)

## Acceptance Criteria

- [ ] `ProposeCoursesResponse` is either used in at least one type annotation or deleted

## Work Log

- 2026-04-04: Found by simplicity reviewer
