---
status: pending
priority: p3
issue_id: "143"
tags: [code-review, dead-export, simplicity]
dependencies: []
---

# `MAX_POST_WORDS` Exported From `html-text.ts` But May Have No External Consumers

## Problem Statement

`src/lib/html-text.ts:3` exports `MAX_POST_WORDS = 2500`. Verify whether any file outside `html-text.ts` actually imports it. If not, unexport it — matching the spirit of the same working tree's `buildReadme` / `CuratedLessonSchema` / `ALLOWED_LESSON_COUNTS` cleanup.

## Findings

**Location:** `src/lib/html-text.ts:3`

Flagged P3 by code-simplicity-reviewer.

Quick verification command:
```bash
grep -rn "MAX_POST_WORDS" src/ spike/ --include='*.ts' --include='*.tsx'
```

If the only references are inside `html-text.ts` itself plus a comment in `src/types/index.ts:10`, the export is dead.

## Proposed Solutions

### Option A: Unexport if no imports exist

```ts
const MAX_POST_WORDS = 2500
```

- Pros: Tighter API surface, consistent with sibling unexports in this working tree.
- Cons: External tools or future call sites would need to re-export. Minor.
- Effort: Small.

### Option B: Keep export as documentation handle

- Pros: Other modules can refer to `MAX_POST_WORDS` symbolically rather than the literal `2500`.
- Cons: No current consumer benefits.
- Effort: Zero.

## Recommended Action

_Pending triage._ Resolve by running the grep verification first.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`

## Acceptance Criteria

- [ ] Verified no external consumers via grep
- [ ] If none: const is module-private
- [ ] `tsc --noEmit` passes

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- Sibling unexports in same working tree: `buildReadme`, `CuratedLessonSchema`, `ALLOWED_LESSON_COUNTS`
