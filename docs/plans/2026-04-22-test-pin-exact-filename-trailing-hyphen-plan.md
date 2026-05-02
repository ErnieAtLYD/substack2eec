---
title: "test(ai-filename): tighten weak filename assertions to exact toBe"
type: test
status: active
date: 2026-04-22
issue_id: "137"
---

# test(ai-filename): tighten weak filename assertions to exact toBe

Three tests in `src/__tests__/ai-filename.test.ts` use weaker assertions than their two siblings (which pin filenames with `toBe(...)`). Unify them all on `toBe` so a future off-by-one in `parseLessonMarkdown` can't silently produce a different valid-shaped filename.

Resolves [todo #137](../../todos/137-pending-p3-trailing-hyphen-test-should-pin-exact-filename.md). Scope extended per technical review to cover the two sibling tests with the same pattern weakness.

Implementation under test: `src/lib/ai.ts:441-442` — 40-char slice, strip leading/trailing hyphens, prepend `lesson-NN-` (zero-padded).

## Acceptance Criteria

- [ ] `src/__tests__/ai-filename.test.ts:22` → `expect(lesson.filename).toBe('lesson-01-a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t.md')`
- [ ] `src/__tests__/ai-filename.test.ts:28` → `expect(lesson.filename).toBe('lesson-02-something-useful.md')`
- [ ] `src/__tests__/ai-filename.test.ts:36` → `expect(lesson.filename).toBe('lesson-01-some-post-title.md')`
- [ ] `GeneratedLessonSchema.parse` guards on lines 23, 29, 37 remain in place.
- [ ] `npm test -- ai-filename` passes all 5 tests.
- [ ] Todo `137-pending-p3-*` renamed to `137-complete-p3-*` with work log updated.

## Follow-up (separate todo)

Extract slug normalization (`src/lib/ai.ts:441`) into a named helper (`safeSlugFromRaw`) so tests can target the normalizer directly. Out of scope here; track as a new P3.
