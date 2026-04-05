---
status: pending
priority: p2
issue_id: "089"
tags: [code-review, agent-native, validation, api-design]
dependencies: []
---

# `lessonCount` in `/api/propose-courses` Silently Coerces Invalid Values to 5 — Surprising for Agents

## Problem Statement

The propose-courses route accepts `lessonCount: z.number().optional()` with no constraint to `ALLOWED_LESSON_COUNTS`. The `isLessonCount` guard at line 42 silently coerces any invalid value to 5:

```ts
const lessonCount = isLessonCount(body.lessonCount) ? body.lessonCount : 5 as LessonCount
```

An agent sending `{ lessonCount: 10 }` expects to receive 10-lesson candidates. Instead it silently gets 5-lesson candidates with no error or indication the value was changed.

CLAUDE.md documents `lessonCount?: number` without noting the silent coercion or the allowed values.

## Findings

- `src/app/api/propose-courses/route.ts:23` — `lessonCount: z.number().optional()` (no allowlist constraint)
- `src/app/api/propose-courses/route.ts:42` — silent coercion to 5
- CLAUDE.md Step 1b — `lessonCount?: number` with no mention of allowed values or coercion

**Source:** Agent-native reviewer

## Proposed Solutions

### Option A — Reject invalid values with 400 (Recommended)
Change the Zod schema to validate against the allowlist:
```ts
lessonCount: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]).optional()
```
Return 400 for invalid values instead of silently defaulting.

**Pros:** Predictable API. Agents know immediately if their input was wrong.
**Cons:** Minor breaking change if anything currently sends non-standard values.
**Effort:** Small | **Risk:** Low

### Option B — Document the coercion in CLAUDE.md
Add: "Invalid `lessonCount` values are silently coerced to 5. Use one of [3, 5, 7, 10]."

**Pros:** No code change.
**Cons:** Surprising API design; agents will wonder why their input was ignored.
**Effort:** Trivial | **Risk:** None

## Recommended Action

Option A — matches CLAUDE.md's stated constraint that `lessonCount` must be one of `[3, 5, 7, 10]`.

## Technical Details

**Affected files:**
- `src/app/api/propose-courses/route.ts:23, 42`
- `CLAUDE.md` Step 1b (update to show allowed values)

## Acceptance Criteria

- [ ] Invalid `lessonCount` returns 400 (not silent coercion)
- [ ] CLAUDE.md lists allowed values for propose-courses `lessonCount`

## Work Log

- 2026-04-04: Found by agent-native reviewer
