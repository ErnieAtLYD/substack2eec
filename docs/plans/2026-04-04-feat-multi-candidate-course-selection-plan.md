---
title: feat: Multi-Candidate Course Selection
type: feat
status: completed
date: 2026-04-04
---

# feat: Multi-Candidate Course Selection

## Overview

The app currently picks one course theme silently and immediately generates lessons from it. Users who paste in a newsletter with multiple distinct topic areas (e.g. a newsletter covering economics, geopolitics, and tech) get whatever theme Claude happened to choose — with no way to influence the direction. This feature adds a **theme-picker step** between post-fetching and generation: Claude proposes 3 distinct course candidates, the user picks one, and only then does lesson generation begin.

## Problem Statement / Motivation

If a newsletter covers multiple interests, the current pipeline is essentially a lottery. The user has no agency over what kind of course gets created. The fix is to surface 3 meaningfully different course angles upfront, let the user choose the one that matches their intent, and proceed with that selection.

## Proposed Solution

Split the existing monolithic curate pipeline into two distinct stages:

1. **Propose** — new `POST /api/propose-courses` returns 3 `CuratedSelection` candidates from one AI call. Each candidate covers a different thematic angle and draws on different posts.
2. **Generate** — existing `POST /api/curate` SSE stream, but now accepts an optional `selectedCourse: CuratedSelection`. When provided, it sanitizes the fields and skips the AI curation step, going straight to rewriting.

The UI gains a new `'picking'` step between `'fetching'` and `'generating'` that renders 3 candidate cards. User clicks one card to immediately kick off generation.

## Technical Approach

### New AI function — `proposeCourseCandidates`

Location: `src/lib/ai.ts`

A single Anthropic tool-use call that asks Claude to produce 3 **distinct** course candidates in one shot. Producing all candidates in one call is preferred over calling `curatePostSelection` three times because:
- 1 API call instead of 3 (cheaper, faster)
- Claude can explicitly diversify themes since it sees all candidates at once

**Tool schema** (wraps an array of candidates):
```ts
{
  name: 'propose_course_candidates',
  input_schema: {
    type: 'object',
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          // same shape as buildCurationTool output:
          // courseTitle (≤60 chars), courseDescription, targetAudience,
          // overallRationale, lessons[] (slug, sequencePosition, lessonFocus, selectionRationale)
        }
      }
    }
  }
}
```

**Prompt instruction**: "Propose exactly 3 distinctly different course angles. Each should emphasize a different theme from the newsletter, use mostly different posts (minimal overlap), and stand alone as a coherent course."

**Signature** (`candidateCount` is intentionally not a parameter — always 3):
```ts
export async function proposeCourseCandidates(
  posts: SubstackPost[],
  lessonCount: number,
): Promise<CuratedSelection[]>
```

**Required implementation details:**
- `max_tokens: 8192` — 3 candidates × ~5 lessons each produces ~2,400–4,800 output tokens depending on lessonCount; 4096 truncates at lessonCount=10 (known failure mode: `docs/solutions/runtime-errors/anthropic-tool-use-max-tokens-truncation.md`)
- Check `response.stop_reason === 'max_tokens'` before parsing (same as `curatePostSelection`)
- Validate each candidate individually: filter out any where `Array.isArray(c.lessons)` is false
- Throw if fewer than 3 valid candidates are returned

### New route — `POST /api/propose-courses`

Location: `src/app/api/propose-courses/route.ts`

- `export const maxDuration = 60` — Vercel default (10s on Hobby) is too low for tail-case Claude response times; streaming is not involved so 180 is not needed
- Validate request with Zod (posts array + optional lessonCount)
- Call `proposeCourseCandidates(posts, lessonCount)`
- Return `{ candidates: CuratedSelection[] }` as JSON
- Errors: 400 (bad input), 500 (AI failure)

```ts
// Request
{ posts: SubstackPost[], lessonCount?: number }

// Response 200
{ candidates: CuratedSelection[] }   // always exactly 3
```

### Modified route — `POST /api/curate`

Location: `src/app/api/curate/route.ts`

Add `selectedCourse?: CuratedSelection` to the Zod schema with full field-level constraints matching `buildCurationTool`'s JSON Schema. When present:
- Apply `sanitizeForPrompt` to all client-supplied string fields (see Security section below)
- Skip `curatePostSelection` entirely
- Use the sanitized `selectedCourse` directly as `selection`
- Still emit the `selection` SSE event (so the frontend log works unchanged)
- The `selection` SSE event is informational from the client's perspective when using `selectedCourse`; `handleConfirmCandidate` sets `courseMeta` immediately from the candidate, not by waiting on this event

```ts
// Modified request shape
{
  posts: SubstackPost[],
  lessonCount?: number,
  selectedCourse?: CuratedSelection   // NEW — if provided, skips curation
}
```

**Zod schema for `selectedCourse`** (mirrors `buildCurationTool` constraints):
```ts
const CuratedLessonSchema = z.object({
  slug: z.string().max(500),
  sequencePosition: z.number().int().min(1).max(10),
  lessonFocus: z.string().max(300),
  selectionRationale: z.string().max(300),
})

const CuratedSelectionSchema = z.object({
  courseTitle: z.string().max(60),
  courseDescription: z.string().max(500),
  targetAudience: z.string().max(200),
  overallRationale: z.string().max(500),
  lessons: z.array(CuratedLessonSchema).min(1).max(10),
})

// In CurateRequestSchema:
selectedCourse: CuratedSelectionSchema.optional(),
```

**Slug cross-reference check** (after Zod parse, before any AI call):
```ts
if (body.selectedCourse) {
  const unknownSlugs = body.selectedCourse.lessons
    .map(l => l.slug)
    .filter(s => !postsBySlug.has(s))
  if (unknownSlugs.length > 0) {
    return NextResponse.json(
      { error: 'Selected course references posts not in the submitted list' },
      { status: 400 }
    )
  }
}
```

Without this check, fabricated slugs cause `if (!post) continue` to silently skip all lessons, returning HTTP 200 with an empty `done` event.

### Security: sanitizing `selectedCourse` fields

`selectedCourse` comes from the client. Its string fields are embedded verbatim into AI prompts via `buildCourseContextBlock` (`src/lib/ai.ts:205`) and `rewriteAsLesson` (`src/lib/ai.ts:248`). `xmlEscape` (which the code already applies) prevents XML structural breakout but does NOT prevent semantic prompt injection inside element content.

Apply `sanitizeForPrompt` at the route handler level immediately after Zod parsing, before any AI call:

```ts
if (body.selectedCourse) {
  const sc = body.selectedCourse
  selectedCourse = {
    ...sc,
    courseTitle:       sanitizeForPrompt(sc.courseTitle),
    courseDescription: sanitizeForPrompt(sc.courseDescription),
    targetAudience:    sanitizeForPrompt(sc.targetAudience),
    overallRationale:  sanitizeForPrompt(sc.overallRationale),
    lessons: sc.lessons.map(l => ({
      ...l,
      lessonFocus:         sanitizeForPrompt(l.lessonFocus),
      selectionRationale:  sanitizeForPrompt(l.selectionRationale),
    })),
  }
}
```

This is consistent with how `formatPostsForCuration` already sanitizes post fields before they reach Claude.

### Type changes — `src/types/index.ts`

```ts
// New (ProposeCoursesRequest is intentionally omitted — it duplicates CurateRequest)
export interface ProposeCoursesResponse {
  candidates: CuratedSelection[]
}

// Updated
export interface CurateRequest {
  posts: SubstackPost[]
  lessonCount?: number
  selectedCourse?: CuratedSelection   // NEW
}
```

### UI changes — `src/components/features/ReviewForm.tsx`

**New step added to the state machine:**
```ts
type Step = 'input' | 'fetching' | 'picking' | 'generating' | 'review' | 'downloading'
//                                   ^^^^^^^^ NEW
```

**New and modified state:**
```ts
const [candidates, setCandidates] = useState<CuratedSelection[]>([])
const [fetchedPosts, setFetchedPosts] = useState<SubstackPost[]>([])
// NOTE: posts must be hoisted to component state — local var in handleGenerate
// is destroyed when the function returns at step='picking', before handleConfirmCandidate runs
```

**Modified `handleGenerate`:**
1. Fetch posts (unchanged)
2. `setFetchedPosts(data.posts)` — hoist to state so `handleConfirmCandidate` can access it
3. Call `POST /api/propose-courses` → get 3 candidates
4. `setCandidates(data.candidates)`, set `step = 'picking'`

**New `handleConfirmCandidate(candidate: CuratedSelection)`:**
1. Set `step = 'generating'`, set `courseMeta` immediately from candidate (don't wait for SSE `selection` event)
2. Call `POST /api/curate` with `{ posts: fetchedPosts, lessonCount: 5, selectedCourse: candidate }`
3. Process SSE stream (unchanged from current)

**`handleStartOver`:** Add `setFetchedPosts([])` and `setCandidates([])`.

**New `'picking'` render block (single-click — no intermediate selected state):**
- 3 candidate cards in a responsive grid (1-col mobile, 3-col desktop)
- Each card shows: course title, course description, target audience badge, lesson count
- Clicking "Choose this course →" on a card **immediately calls `handleConfirmCandidate(candidate)`** — no separate "Generate" CTA needed; there are only 3 choices and selection is unambiguous
- "Back" link returns to `'input'` step

## System-Wide Impact

- **Agent API**: `POST /api/curate` stays backward-compatible — `selectedCourse` is optional. Agents using the existing flow work unchanged.
- **`POST /api/propose-courses`** is a new agent-callable endpoint. Documented in CLAUDE.md under Agent API (see below).
- **SSE event sequence**: unchanged. The `selection` event is still emitted in curate (now sourced from `selectedCourse` when provided). Treat as informational — don't use it to set `courseMeta` when `selectedCourse` was provided.
- **Session storage**: `eec_meta` and `eec_lessons` keys are unaffected. Candidate state is ephemeral — refresh during picking returns to `'input'`, which is acceptable.
- **Prompt cache**: `rewriteAsLesson` applies `cache_control: { type: 'ephemeral' }` to the course context block (5-minute TTL). In the original pipeline the curation-to-rewrite gap was zero, so the cache was always warm. The new picking step introduces a human-in-the-loop delay; if the user spends >5 minutes picking, all N rewrite calls miss the cache and pay full input token cost. This is an accepted tradeoff for the UX improvement — no architectural change needed.
- **Rate limiting**: `/api/propose-courses` must be added to `src/middleware.ts` in the same PR as the new route — new routes are not automatically covered.

## Acceptance Criteria

- [x] `POST /api/propose-courses` returns exactly 3 `CuratedSelection` objects, each with a distinct course title and theme
- [x] Candidates use different subsets of posts (no single post appears in all 3)
- [x] `proposeCourseCandidates` uses `max_tokens: 8192`, checks `stop_reason`, validates each candidate individually
- [x] `POST /api/propose-courses` has `export const maxDuration = 60`
- [x] `POST /api/propose-courses` is added to `src/middleware.ts` rate limiter (3 req/min/IP)
- [x] `selectedCourse` Zod schema enforces field-length constraints matching `buildCurationTool`
- [x] Slug cross-reference check returns 400 if any lesson slug not in submitted posts
- [x] `sanitizeForPrompt` applied to all 5 client-supplied string fields of `selectedCourse` before any AI call
- [x] UI shows a `'picking'` step with 3 candidate cards after post-fetch completes
- [x] Each card displays: title, description, target audience, lesson count
- [x] Clicking a card immediately calls `handleConfirmCandidate` (single-click, no separate Generate CTA)
- [x] `posts` hoisted to `useState<SubstackPost[]>` so `handleConfirmCandidate` can access it
- [x] `/api/curate` without `selectedCourse` still works as before (backward compat)
- [x] Back navigation from `'picking'` returns to `'input'`
- [x] Error from `/api/propose-courses` shows inline error and returns to `'input'` step
- [x] CLAUDE.md updated with Agent API docs for new route and updated curate request shape

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| Claude returning overlapping candidates | Prompt explicitly instructs diversity; validate client-side that titles differ |
| Propose step takes >15s | `maxDuration = 60` prevents silent Vercel kill; `max_tokens: 8192` prevents truncation |
| Mobile layout for 3-card picker | Stack vertically on mobile; horizontal grid on md+ breakpoint |
| User confusion about picking step | Clear heading: "Choose your course theme" + subtitle explaining the step |
| Client-controlled `selectedCourse` fields injected into AI prompts | `sanitizeForPrompt` on all 5 fields at route boundary before any AI call |
| Fabricated slugs producing empty course silently | Slug cross-reference check returns 400 if any lesson slug not in submitted posts |
| API cost abuse via `/api/propose-courses` loop | Rate limiter: 3 req/min/IP in middleware.ts |
| Prompt cache misses on long picking sessions | Acknowledged tradeoff; ephemeral cache TTL is 5min — users who spend longer miss cache on rewrite calls |

## Files to Touch

```
src/types/index.ts                        — add ProposeCoursesResponse, update CurateRequest
src/lib/ai.ts                             — add proposeCourseCandidates()
src/app/api/propose-courses/route.ts      — NEW (maxDuration=60, rate-limited)
src/app/api/curate/route.ts               — selectedCourse: Zod schema, slug check, sanitizeForPrompt, skip curation when present
src/components/features/ReviewForm.tsx    — add 'picking' step, fetchedPosts state, candidate cards (single-click)
src/middleware.ts                         — add /api/propose-courses to LIMITS and matcher
CLAUDE.md                                 — update Agent API section (see below)
```

## CLAUDE.md Updates

Apply these changes to `CLAUDE.md` in the same PR:

**Update the Agent API pipeline summary line:**
```
Four-step pipeline (propose is optional): fetch → [propose →] curate (SSE) → export
```

**Add after the Step 1 block:**

```markdown
### Step 1b (optional) — POST /api/propose-courses

\`\`\`ts
// Request
{ posts: SubstackPost[], lessonCount?: number }

// Response 200
{ candidates: CuratedSelection[] }   // always exactly 3 distinct themes

// Errors: 400 (bad input), 500 (AI failure)
\`\`\`

Returns 3 thematically distinct course candidates. Pass the chosen `CuratedSelection`
as `selectedCourse` to `POST /api/curate` to skip auto-curation and go straight to
lesson rewriting. `candidateCount` is fixed at 3 and is not a request parameter.
```

**Update the Step 2 request shape to show `selectedCourse`:**
```ts
// Request
{
  posts: SubstackPost[],
  lessonCount?: 3 | 5 | 7 | 10,
  selectedCourse?: CuratedSelection  // if provided, skips AI curation step
}
```

## Sources & References

- Existing curation tool pattern: `src/lib/ai.ts:31` (`buildCurationTool`)
- Existing curate route Step 1: `src/app/api/curate/route.ts:56` (`curatePostSelection` call)
- Step state machine: `src/components/features/ReviewForm.tsx:6`
- Session storage pattern: `src/components/features/ReviewForm.tsx:19-67`
- Known failure — tool-use truncation: `docs/solutions/runtime-errors/anthropic-tool-use-max-tokens-truncation.md`
- Known failure — second-order prompt injection: `docs/solutions/security-issues/prompt-injection-llm-pipeline.md`
- Known failure — stale closure in React state: `docs/solutions/logic-errors/stale-closure-functional-state-updater.md`
