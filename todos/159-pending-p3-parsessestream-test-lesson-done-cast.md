---
status: pending
priority: p3
issue_id: "159"
tags: [code-review, testing, types]
dependencies: []
---

# `parseSSEStream` Multi-Byte Test Constructs an Invalid `lesson_done` Event

## Problem Statement

The multi-byte UTF-8 test in `parseSSEStream.test.ts` constructs:

```ts
const event = { type: 'lesson_done', lesson: { title: 'naïve', lessonNumber: 1 } }
```

This object is missing several `GeneratedLesson` fields (`subjectLine`, `previewText`, `markdownBody`, `keyTakeaway`, `filename`). The test casts to `Extract<CurateSSEEvent, { type: 'lesson_done' }>` to assert. The roundtrip succeeds only because `parseSSEStream` doesn't validate — fine for the decoder test's scope, but the loosening should be explicit at construction.

The test could just as well use `{ type: 'lesson_start', lessonNumber: 1 }` (no nested object, fewer required fields) and still exercise multi-byte boundary handling.

## Findings

**Location:** `src/components/features/__tests__/parseSSEStream.test.ts:69-82`

Flagged by kieran-typescript-reviewer (P2-4).

## Proposed Solutions

### Option A: Switch the multi-byte test to a `lesson_start` event with multi-byte content elsewhere

- Pros: Removes the cast; test's intent (UTF-8 boundary) stays clean.
- Cons: Have to find another field to plant the multi-byte char in.
- Effort: Small.

### Option B: Construct a complete `GeneratedLesson` fixture

- Pros: No cast.
- Cons: 7 extra noisy fields for a decoder test.
- Effort: Small.

## Recommended Action

_Pending triage._

## Technical Details

**Affected files:**
- `src/components/features/__tests__/parseSSEStream.test.ts`

## Acceptance Criteria

- [ ] No `as` cast on the event under test
- [ ] Multi-byte boundary still exercised

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.
