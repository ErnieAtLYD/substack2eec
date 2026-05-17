---
status: pending
priority: p2
issue_id: "169"
tags: [code-review, security, test-coverage, trust-boundary]
dependencies: []
---

# `selectedCourse` Short-Circuit Branch Of `/api/curate` Has No Regression Test For `MAX_POST_WORDS`

## Problem Statement

`src/__tests__/curate-route-word-cap.test.ts` (added in PR #17) pins that `bodyText` is truncated before `curatePostSelection` runs. But the route has a second branch: when `selectedCourse` is provided, curation is skipped and the route goes directly to `rewriteAsLesson` (`route.ts:64-81`). The test does not cover that branch.

The cap *does* hold — both branches operate on the same already-truncated `posts` array — but the lesson from the bug this PR fixed is exactly: **trust-boundary contracts must be pinned with tests, not by inspection**. A future refactor could move the truncation inside the auto-curation branch, silently reopening the bypass for the `selectedCourse` path.

Flagged by security-sentinel (P2).

## Findings

**Location:** `src/__tests__/curate-route-word-cap.test.ts:43-78` (only auto-curation path); `src/app/api/curate/route.ts:64-81` (the untested branch).

## Proposed Solutions

### Option A: Add a parallel test for the `selectedCourse` branch (recommended)

```ts
it('truncates bodyText to MAX_POST_WORDS in the selectedCourse short-circuit branch too', async () => {
  const oversized = Array.from({ length: 4000 }, (_, i) => `word${i}`).join(' ')
  const selectedCourse: CuratedSelection = {
    courseTitle: 'X', courseDescription: 'X', targetAudience: 'X', overallRationale: 'X',
    lessons: [{ slug: 'test-post', sequencePosition: 1, lessonFocus: 'X', keyTakeaway: 'X' }],
  }
  rewriteAsLesson.mockResolvedValue('# title\nbody')
  await (await POST(request({
    posts: [postFixture({ bodyText: oversized })],
    selectedCourse,
  }))).text()
  const [postArg] = rewriteAsLesson.mock.calls[0]
  expect((postArg as { bodyText: string }).bodyText.split(/\s+/).filter(Boolean).length)
    .toBeLessThanOrEqual(MAX_POST_WORDS)
})
```

- Pros: Closes the symmetric coverage gap. Same shape as the existing test.
- Cons: Adds ~20 lines of test code.
- Effort: Trivial.

### Option B: Refactor truncation into a single shared helper used by both branches, then test the helper

- Pros: Single point of enforcement.
- Cons: Adds indirection; the inline code is already clear. Doesn't address the test gap directly.
- Effort: Small.

## Recommended Action

_Pending triage._ Option A. The whole point of the regression-test discipline is symmetry.

## Technical Details

**Affected files:**
- `src/__tests__/curate-route-word-cap.test.ts`

## Acceptance Criteria

- [ ] Test fails if a future refactor scopes truncation to the auto-curation branch only
- [ ] `selectedCourse` flow demonstrably enforces `MAX_POST_WORDS`

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/__tests__/curate-route-word-cap.test.ts`
- `src/app/api/curate/route.ts:64-81`
- `docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md` — "Pin trust-boundary contracts with tests"
