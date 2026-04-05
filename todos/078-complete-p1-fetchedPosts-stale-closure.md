---
status: pending
priority: p1
issue_id: "078"
tags: [code-review, typescript, react, stale-closure]
dependencies: []
---

# `fetchedPosts` Stale Closure Risk in `handleConfirmCandidate`

## Problem Statement

`handleConfirmCandidate` reads `fetchedPosts` from React state via closure:

```ts
body: JSON.stringify({ posts: fetchedPosts, lessonCount: 5, selectedCourse: candidate })
// src/components/features/ReviewForm.tsx:187
```

The function is safe *today* because `picking` step is only reachable after `setFetchedPosts` has been called. However, it is a fragile dependency on step-gate correctness. If the step guard changes, or if React batches the `setFetchedPosts` update such that a re-render hasn't settled before `handleConfirmCandidate` fires, the stale closure will silently send an empty `posts: []` array to `/api/curate`, which returns a 400 error.

Additionally, the existing `docs/solutions/logic-errors/stale-closure-functional-state-updater.md` specifically documents this anti-pattern in the codebase.

## Findings

- `src/components/features/ReviewForm.tsx:187` — reads `fetchedPosts` from closure
- `fetchedPosts` state is set at line 144 in `handleGenerate`
- `handleConfirmCandidate` is a separate function that closes over the state variable
- `docs/solutions/logic-errors/stale-closure-functional-state-updater.md` — known pattern in this codebase

**Source:** TypeScript reviewer, learnings researcher (stale closure solution doc)

## Proposed Solutions

### Option A — Pass posts via callback argument (Recommended)
Change the candidate card's onClick to pass `fetchedPosts` at click time:

```ts
onClick={() => handleConfirmCandidate(candidate, fetchedPosts)}
```

And update `handleConfirmCandidate` signature:
```ts
async function handleConfirmCandidate(candidate: CuratedSelection, posts: SubstackPost[])
```

**Pros:** Makes the dependency explicit in the function signature. No stale closure possible.
**Cons:** Minor API change to `handleConfirmCandidate`.
**Effort:** Small
**Risk:** None

### Option B — Use a `useRef` for fetchedPosts
Store `fetchedPosts` in a `useRef` alongside the state, and read from the ref in `handleConfirmCandidate`.

**Pros:** Ref always has the latest value, immune to stale closures.
**Cons:** More ceremony; two sources of truth for the posts.
**Effort:** Small
**Risk:** Low

### Option C — Keep as-is with a comment
Document the step-gate dependency so future maintainers understand why this is safe.

**Pros:** Zero code change.
**Cons:** Fragile; next person to change step gating will break this silently.
**Effort:** Minimal
**Risk:** Medium

## Recommended Action

Option A — pass posts as an explicit argument to `handleConfirmCandidate`.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:155–187`

## Acceptance Criteria

- [ ] `handleConfirmCandidate` does not read `fetchedPosts` from a closure
- [ ] If `fetchedPosts` is empty when the function runs, the error path fires explicitly (not silently)

## Work Log

- 2026-04-04: Found by TypeScript reviewer; confirmed against stale-closure solution doc
