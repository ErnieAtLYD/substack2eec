---
status: complete
priority: p3
issue_id: "018"
tags: [code-review, performance, quality]
dependencies: []
---

# `examples` Array Defined Inside Render Function — Recreated on Every SSE Update

## Problem Statement

The `examples` constant is declared inside the component body, causing React to allocate a new array and three new objects on every render. During the `generating` step, `streamLog` updates on every SSE event (potentially 20+ times), triggering 20+ unnecessary allocations of a static constant.

**Why it matters:** Low impact at current scale, but a simple zero-risk fix. Also signals to future developers that this value is dynamic when it is not.

## Findings

**Location:** `src/components/features/ReviewForm.tsx`, lines 274–278

```typescript
const examples = [
  { label: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com' },
  { label: 'The Generalist', url: 'https://www.generalist.com' },
  { label: 'Not Boring', url: 'https://www.notboring.co' },
]
```

This array has no dependency on props or state. It belongs at module scope.

## Proposed Solutions

### Option A — Move to module scope (Recommended)

```typescript
const EXAMPLE_NEWSLETTERS = [
  { label: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com' },
  { label: 'The Generalist', url: 'https://www.generalist.com' },
  { label: 'Not Boring', url: 'https://www.notboring.co' },
] as const
```

- **Pros:** Zero-cost fix, signals constant intent
- **Cons:** None
- **Effort:** Trivial | **Risk:** None

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `src/components/features/ReviewForm.tsx`

## Acceptance Criteria

- [ ] `examples` (or equivalent) is defined at module scope, not inside the component

## Work Log

- 2026-03-27: Surfaced by TypeScript reviewer and performance-oracle agents during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
