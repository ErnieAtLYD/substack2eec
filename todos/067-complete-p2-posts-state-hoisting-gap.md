---
status: pending
priority: p2
issue_id: "067"
tags: [code-review, react, state-management, multi-candidate]
dependencies: []
---

# `posts` Local Variable Lost When `handleGenerate` Returns at `'picking'` Step

## Problem Statement

In `ReviewForm.tsx`, `posts` is a local variable scoped to `handleGenerate` (line 127). In the current flow, `handleGenerate` runs all the way through to SSE completion before returning, so `posts` is available for the entire pipeline.

The new multi-candidate flow breaks this: `handleGenerate` fetches posts, calls `/api/propose-courses`, sets `step = 'picking'`, then **returns**. The variable `posts` is destroyed when the function returns.

When the user clicks a candidate card, `handleConfirmCandidate` runs — but it has no access to `posts`. Yet it must send `posts` to `POST /api/curate`. The implementation will fail to compile or silently send an empty array.

The plan does not call this out as a required state change.

## Findings

**Source:** TypeScript reviewer (finding 4)

**Affected file:** `src/components/features/ReviewForm.tsx:127`

```typescript
async function handleGenerate(e: React.FormEvent) {
  // ...
  let posts: SubstackPost[]  // ← local var, destroyed when function returns
  try {
    const res = await fetch('/api/fetch-posts', ...)
    const data = await res.json()
    posts = data.posts  // ← set here
    // ...
  }
  // New flow: set step = 'picking', return
  // posts is now gone
}

// Called from candidate card click:
async function handleConfirmCandidate(candidate: CuratedSelection) {
  // posts is undefined here — compilation error or runtime bug
  await fetch('/api/curate', { body: JSON.stringify({ posts, lessonCount: 5, selectedCourse: candidate }) })
}
```

## Proposed Solutions

### Option A — Hoist `posts` to component state (Recommended)

Add `const [fetchedPosts, setFetchedPosts] = useState<SubstackPost[]>([])` to the component. Set it after the fetch-posts call succeeds. `handleConfirmCandidate` reads from `fetchedPosts`.

```typescript
const [fetchedPosts, setFetchedPosts] = useState<SubstackPost[]>([])

async function handleGenerate(e: React.FormEvent) {
  // ...
  const data = await res.json()
  setFetchedPosts(data.posts)  // hoist to state
  // ...
}

async function handleConfirmCandidate(candidate: CuratedSelection) {
  await fetch('/api/curate', {
    body: JSON.stringify({ posts: fetchedPosts, lessonCount: 5, selectedCourse: candidate })
  })
}
```

Also clear on `handleStartOver`: `setFetchedPosts([])`.

**Pros:** Minimal change; straightforward; consistent with how `lessons` and `courseMeta` are handled
**Cons:** Posts can be large (~50 items with bodyText); React state diffing is a no-op since the array reference only changes once
**Effort:** Small
**Risk:** Low

### Option B — Pass `posts` as parameter to `handleConfirmCandidate`

Store posts in a `useRef` instead of state, avoiding React re-renders when posts are set.

```typescript
const fetchedPostsRef = useRef<SubstackPost[]>([])
// Set: fetchedPostsRef.current = data.posts
// Use: body: JSON.stringify({ posts: fetchedPostsRef.current, ... })
```

**Pros:** No re-render on posts assignment
**Cons:** `useRef` is less idiomatic for "data the component needs across render cycles"; `useState` is clearer
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A. Hoist to `useState<SubstackPost[]>`. This is a required state change — implementation will fail without it. The plan must call it out explicitly.

## Technical Details

- **File:** `src/components/features/ReviewForm.tsx`
- **Line:** 127 (`let posts: SubstackPost[]`)
- **Also update:** `handleStartOver` to clear `fetchedPosts`

## Acceptance Criteria

- [ ] `fetchedPosts` added to component state
- [ ] `handleGenerate` sets `fetchedPosts` after successful fetch
- [ ] `handleConfirmCandidate` reads from `fetchedPosts` when calling `/api/curate`
- [ ] `handleStartOver` clears `fetchedPosts`
- [ ] Plan document calls this out explicitly as a required ReviewForm state change

## Work Log

- 2026-04-04: Created during plan review. TypeScript reviewer identified this as a required state change missing from the plan.
