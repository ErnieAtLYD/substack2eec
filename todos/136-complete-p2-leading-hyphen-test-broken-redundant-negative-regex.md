---
status: complete
priority: p2
issue_id: "136"
tags: [code-review, testing, false-confidence]
dependencies: []
---

# Leading-Hyphen Test Has Broken & Redundant Negative Regex

## Problem Statement

In `src/__tests__/ai-filename.test.ts:30`, the new "strips leading hyphens" test has a negative assertion that is both broken and redundant:

```ts
expect(lesson.filename).not.toMatch(/^lesson-02--.md/)
```

The `.` is an unescaped regex metacharacter (matches any char), and there is no `$` anchor. The pattern therefore requires *exactly one character* between `--` and `md` — but the actual failure mode would produce `lesson-02--something-useful.md`, which has many characters between `--` and `md` and would *pass* this assertion even when the bug reappears. This is false-confidence tooling: it looks like a guard but doesn't guard anything.

Additionally, the positive assertion on the very next line (`toMatch(/^lesson-02-something/)`) already fully proves the absence of a double hyphen — if leading hyphens weren't stripped, the filename would start with `lesson-02--something` and fail that match. Line 30 contributes zero unique coverage.

The inline comment on line 27 (`// '!!!' → '---' after replace; strip-edges removes leading hyphens too`) also restates what the test name and slug value already convey and can be removed.

## Findings

**Location:** `src/__tests__/ai-filename.test.ts:26-33`

Both the TypeScript reviewer and the simplicity reviewer flagged this independently. The TypeScript reviewer noted that if the bug reappeared, the assertion would still pass — a false-confidence failure mode. The simplicity reviewer confirmed the assertion adds zero coverage beyond the positive `toMatch` on the next line.

## Proposed Solutions

### Option A: Delete the broken line and the redundant comment (recommended)

```ts
it('strips leading hyphens when slug starts with non-alphanumeric chars', () => {
  const lesson = parseLessonMarkdown(minimalMarkdown(2), 2, '!!!something-useful')
  expect(lesson.filename).toMatch(/^lesson-02-something/)
  expect(() => GeneratedLessonSchema.parse(lesson)).not.toThrow()
})
```

- Pros: Removes false confidence, 2 LOC reduction, test intent unchanged.
- Cons: None.
- Effort: Small.

### Option B: Keep a negative assertion but fix it

```ts
expect(lesson.filename).not.toMatch(/^lesson-\d+--/)
```

- Pros: Explicitly documents "no double hyphen after the lesson prefix."
- Cons: Still redundant with the positive assertion below it.
- Effort: Small.

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/__tests__/ai-filename.test.ts`
- **Effort:** Small

## Acceptance Criteria

- [ ] Line 30's broken `/^lesson-02--.md/` regex is removed or fixed.
- [ ] Line 27 comment is removed (or justified).
- [ ] `npm test -- ai-filename` still passes.

## Work Log

- 2026-04-21: Identified during code review of PR #15 by kieran-typescript-reviewer and code-simplicity-reviewer.
- 2026-04-21: Applied Option A — removed broken `/^lesson-02--.md/` regex and redundant comment. All 5 ai-filename tests pass.
