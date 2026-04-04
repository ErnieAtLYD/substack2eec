---
status: pending
priority: p3
issue_id: "074"
tags: [code-review, documentation, agent-native, multi-candidate]
dependencies: []
---

# CLAUDE.md Agent API Section Needs Exact Prose for `/api/propose-courses`

## Problem Statement

The plan's "Files to Touch" section says to "document `/api/propose-courses` in Agent API section" but does not draft the content. Without exact prose, documentation gets deferred, underspecified, or inconsistent with the actual implementation. Agents consulting CLAUDE.md after this ships will not know:

- That `POST /api/propose-courses` exists
- That `selectedCourse` is now an accepted field on `POST /api/curate`
- That the two flows are alternatives, not sequential requirements
- That `candidateCount` is fixed at 3 (not exposed as a request parameter)

The "Three-step pipeline" summary line in CLAUDE.md also becomes inaccurate.

## Findings

**Source:** Agent-native reviewer (findings 1, 4)

**Current CLAUDE.md text to update:** `# Agent API` section — "Three-step pipeline: fetch → curate (SSE) → export"

## Proposed Solutions

### Option A — Add exact prose to the plan, commit in same PR as feature (Recommended)

The plan should include the exact CLAUDE.md block to add. At implementation time, apply it verbatim:

**Update the pipeline summary line:**
```
Four-step pipeline (propose is optional): fetch → [propose →] curate (SSE) → export
```

**Add Step 1b block after the fetch-posts section:**
```markdown
### Step 1b (optional) — POST /api/propose-courses

// Request
{ posts: SubstackPost[], lessonCount?: number }

// Response 200
{ candidates: CuratedSelection[] }   // always exactly 3 distinct themes

// Errors: 400 (bad input), 500 (AI failure)

Use this endpoint to get 3 thematically distinct course candidates from the
same posts array, then pass the chosen CuratedSelection as `selectedCourse`
to POST /api/curate to skip the auto-curation step and go straight to
lesson rewriting. `candidateCount` is fixed at 3 and is not a request parameter.
```

**Update Step 2 request shape:**
```typescript
// Request
{
  posts: SubstackPost[],
  lessonCount?: 3 | 5 | 7 | 10,
  selectedCourse?: CuratedSelection  // NEW: if provided, skips AI curation
}
```

**Effort:** Small (copy-paste from plan into CLAUDE.md at implementation time)
**Risk:** None

## Recommended Action

Option A. Add the exact prose blocks to the plan document now so the implementer can apply them without writing documentation from scratch.

## Technical Details

- **File:** `CLAUDE.md` — Agent API section

## Acceptance Criteria

- [ ] Plan document includes exact CLAUDE.md additions for `/api/propose-courses`
- [ ] Plan document includes updated Step 2 request shape showing `selectedCourse?`
- [ ] CLAUDE.md updated as part of the implementation PR (same PR, not a follow-up)
- [ ] Pipeline summary line updated from "Three-step" to reflect optional propose step

## Work Log

- 2026-04-04: Created during plan review. Agent-native reviewer flagged.
