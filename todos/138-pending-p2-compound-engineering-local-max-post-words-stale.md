---
status: pending
priority: p2
issue_id: "138"
tags: [code-review, documentation, drift]
dependencies: []
---

# `compound-engineering.local.md` Still Points `MAX_POST_WORDS` to `substack.ts`

## Problem Statement

The dupes refactor moved `MAX_POST_WORDS` from `src/lib/substack.ts` to the new shared module `src/lib/html-text.ts`. `CLAUDE.md` was updated, but the project's review-context settings file still claims the constant lives in `src/lib/substack.ts`. Reviewers loading this file will get stale guidance.

## Findings

**Location:** `compound-engineering.local.md:18`

Current line:
```
- `MAX_POST_WORDS = 2500` truncation in `src/lib/substack.ts`
```

Should match the updated `CLAUDE.md` line:
```
- `MAX_POST_WORDS = 2500` in `src/lib/html-text.ts` — truncation at extraction time (shared by `src/lib/substack.ts` and `spike/extract.ts`)
```

Flagged by both kieran-typescript-reviewer (P2) and security-sentinel (P2-1).

## Proposed Solutions

### Option A: Update `compound-engineering.local.md:18` to match `CLAUDE.md`

- Pros: Single source of truth, matches what reviewers see.
- Cons: Two files still duplicate the same fact.
- Effort: Small (one-line edit).

### Option B: Remove the line from `compound-engineering.local.md` entirely

- Pros: Eliminates the duplication; `CLAUDE.md` is the canonical source.
- Cons: Reviewers loading the local settings lose the context unless they also read `CLAUDE.md`.
- Effort: Small.

## Recommended Action

_Pending triage._

## Technical Details

**Affected files:**
- `compound-engineering.local.md`

## Acceptance Criteria

- [ ] Line 18 either matches `CLAUDE.md` exactly or is removed
- [ ] No other stale path references remain in the file

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- Related fix: `CLAUDE.md` line updated in same working tree change
