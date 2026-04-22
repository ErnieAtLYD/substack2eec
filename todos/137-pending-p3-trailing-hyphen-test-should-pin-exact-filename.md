---
status: pending
priority: p3
issue_id: "137"
tags: [code-review, testing, assertion-strength]
dependencies: []
---

# Trailing-Hyphen Truncation Test Uses Weak Assertion

## Problem Statement

The "strips a single trailing hyphen when slug truncates at position 40" test (`src/__tests__/ai-filename.test.ts:17-24`) uses:

```ts
expect(lesson.filename).not.toMatch(/-\.md$/)
```

This only proves the filename doesn't *end with* `-.md`. It doesn't pin the expected shape, so a future off-by-one in the slicing logic could silently produce a different valid-shaped filename and the test would still pass.

Other tests in the same file use `toBe('lesson-NN-exact-slug.md')` — this one is inconsistent.

## Findings

**Location:** `src/__tests__/ai-filename.test.ts:17-24`

Flagged by the TypeScript reviewer as an assertion-strength / consistency gap, not a correctness bug. The fixture and intent are correct (PR #15 fixed the fixture so the test actually exercises the truncation path); only the final check is weaker than its siblings.

## Proposed Solutions

### Option A: Pin the exact expected filename

```ts
expect(lesson.filename).toBe('lesson-01-a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t.md')
```

- Pros: Strongest possible regression guard; matches the file's own conventions.
- Cons: Breaks if the lesson-number format ever changes (e.g., zero-padding width).
- Effort: Small.

### Option B: Assert on the post-truncation slug separately

```ts
expect(lesson.filename).toMatch(/^lesson-01-a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t\.md$/)
```

- Pros: Stronger than current, still a regex.
- Cons: More verbose than `toBe` with no real benefit.
- Effort: Small.

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/__tests__/ai-filename.test.ts`
- **Effort:** Small

## Acceptance Criteria

- [ ] The trailing-hyphen test pins the exact expected filename (or an equivalently strong assertion).
- [ ] The `GeneratedLessonSchema.parse` guard remains in place.

## Work Log

- 2026-04-21: Identified during code review of PR #15 by kieran-typescript-reviewer.
