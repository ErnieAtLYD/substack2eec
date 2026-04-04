---
status: pending
priority: p3
issue_id: "073"
tags: [code-review, simplicity, typescript, yagni, multi-candidate]
dependencies: []
---

# YAGNI: `candidateCount` Parameter and `ProposeCoursesRequest` Type Are Unnecessary

## Problem Statement

Two small over-engineering items in the plan:

**1. `candidateCount = 3` parameter on `proposeCourseCandidates`**

The plan proposes:
```typescript
export async function proposeCourseCandidates(
  posts: SubstackPost[],
  lessonCount: number,
  candidateCount = 3,  // ← never called with anything other than 3
): Promise<CuratedSelection[]>
```

The tool schema hardcodes `minItems: 3, maxItems: 3`. The prompt says "Propose exactly 3." The UI renders 3 cards. The route doesn't expose it. The parameter adds cognitive overhead with zero current utility.

**2. `ProposeCoursesRequest` type**

The plan adds:
```typescript
export interface ProposeCoursesRequest {
  posts: SubstackPost[]
  lessonCount?: number
}
```

This is byte-for-byte identical to `CurateRequest`. Two interfaces with the same shape create a synchronization risk — if `CurateRequest` changes, `ProposeCoursesRequest` either drifts silently or requires a separate change. Following the pattern of other routes (which define Zod schemas inline and don't always need a named TS interface), this type adds nothing.

## Findings

**Source:** Simplicity reviewer

## Proposed Solutions

### Option A — Drop both (Recommended)

- Remove `candidateCount` parameter; hardcode 3 in the function and tool schema
- Remove `ProposeCoursesRequest`; the route validates with its inline Zod schema; if a TS type is needed, derive it with `z.infer<typeof ProposeCoursesRequestSchema>`

**Pros:** ~8 fewer LOC; no drift risk; consistent with the codebase's "define constraints once" philosophy
**Effort:** Trivial
**Risk:** None

## Recommended Action

Option A. Update the plan's function signature to remove `candidateCount`, and remove `ProposeCoursesRequest` from the types to add.

## Technical Details

- **File:** `src/lib/ai.ts` (function signature)
- **File:** `src/types/index.ts` (do not add `ProposeCoursesRequest`)

## Acceptance Criteria

- [ ] `proposeCourseCandidates` signature does not include `candidateCount` parameter
- [ ] `ProposeCoursesRequest` not added to `src/types/index.ts`
- [ ] Plan updated accordingly

## Work Log

- 2026-04-04: Created during plan review. Simplicity reviewer flagged both items.
