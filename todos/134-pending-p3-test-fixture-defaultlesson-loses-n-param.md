---
status: pending
priority: p3
issue_id: "134"
tags: [code-review, testing, quality]
dependencies: []
---

# `defaultLesson()` Test Fixture Loses Multi-Lesson Array Expressiveness

## Problem Statement

The refactoring of the test fixture from `lesson(n = 1)` to `lesson(overrides)` + `defaultLesson()` removes the ability to conveniently construct multi-lesson arrays with unique `lessonNumber` and `filename` values. The old `lesson(2)` produced `{ lessonNumber: 2, filename: 'lesson-02-test-lesson.md' }` automatically. The new `defaultLesson()` always returns `lessonNumber: 1` and `filename: 'lesson-01-test-lesson.md'`. Tests that need arrays of distinct lessons now require manual overrides for both fields, which is error-prone.

## Findings

**Location:** `src/__tests__/export-route.test.ts:16-26`

```ts
function defaultLesson() {
  return {
    lessonNumber: 1,               // always 1
    filename: 'lesson-01-test-lesson.md',  // always the same
    ...
  }
}
```

JSZip silently overwrites on duplicate `filename` entries. A future test that passes `[lesson(), lesson()]` (two lessons, identical filenames) would produce a ZIP with only one file — a correctness gap with no assertion failure.

## Proposed Solutions

### Option A: Restore `n` parameter on `defaultLesson` while keeping overrides support
```ts
function defaultLesson(n = 1) {
  return {
    lessonNumber: n,
    title: 'Test Lesson',
    subjectLine: 'Test subject',
    previewText: 'Test preview',
    markdownBody: '# Body',
    keyTakeaway: 'Key takeaway',
    filename: `lesson-0${n}-test-lesson.md`,
  }
}

function lesson(nOrOverrides: number | Partial<ReturnType<typeof defaultLesson>> = 1) {
  if (typeof nOrOverrides === 'number') return defaultLesson(nOrOverrides)
  return { ...defaultLesson(), ...nOrOverrides }
}
```
- Restores `lesson(2)` convenience while keeping `lesson({ filename: 'ab-.md' })` overrides
- Pros: Backwards-compatible with both usage patterns; prevents silent duplicate-filename test bugs
- Cons: Slightly more complex factory

### Option B: Accept current state and add a lint rule / comment warning about duplicate filenames

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/__tests__/export-route.test.ts:12-26`
- **Effort:** Small

## Work Log

- 2026-04-16: Identified by TypeScript reviewer during code review of `fix/export-todos-117-125`
