---
status: pending
priority: p2
issue_id: "088"
tags: [code-review, agent-native, documentation, api-design]
dependencies: []
---

# `lessonCount` Is Ignored When `selectedCourse` Provided — Not Documented in CLAUDE.md

## Problem Statement

When `selectedCourse` is provided to `POST /api/curate`, the server-side `lessonCount` is never read — the lesson plan comes entirely from `selectedCourse.lessons`. However, CLAUDE.md Step 2 documents `lessonCount?` as a meaningful parameter without noting this behavior:

> `lessonCount` defaults to 5 if omitted or invalid

An agent could send `{ lessonCount: 3, selectedCourse: <5-lesson candidate> }` and expect 3 lessons back. It would get 5. This silent behavior is a usability and correctness issue for agents.

## Findings

- `src/app/api/curate/route.ts:70–103` — `lessonCount` only used in `else` branch (no `selectedCourse`)
- `src/components/features/ReviewForm.tsx:187` — UI hardcodes `lessonCount: 5` regardless
- `CLAUDE.md` Step 2 — does not document that `lessonCount` is ignored with `selectedCourse`

**Source:** Agent-native reviewer

## Proposed Solutions

### Option A — Add a sentence to CLAUDE.md (Recommended, fast)
In the Step 2 Constraints section, add:
> Note: when `selectedCourse` is provided, `lessonCount` is ignored — the lesson plan is determined entirely by `selectedCourse.lessons`.

**Effort:** Trivial | **Risk:** None

### Option B — Validate and enforce `lessonCount` from `selectedCourse.lessons.length`
Have the server reject requests where `lessonCount != selectedCourse.lessons.length` (or silently honor `candidate.lessons.length` over `lessonCount`). Makes the API self-consistent.

**Effort:** Small | **Risk:** Low

## Recommended Action

Option A (immediate). Option B is a nice-to-have if you want a more opinionated API.

## Technical Details

**Affected files:**
- `CLAUDE.md` Step 2 section

## Acceptance Criteria

- [ ] CLAUDE.md clearly states that `lessonCount` is ignored when `selectedCourse` is provided
- [ ] OR: server enforces consistency between `lessonCount` and `selectedCourse.lessons.length`

## Work Log

- 2026-04-04: Found by agent-native reviewer
