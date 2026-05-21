---
status: pending
priority: p2
issue_id: "172"
tags: [code-review, documentation, agent-native]
dependencies: []
---

# CLAUDE.md `/api/curate` Section Doesn't Document `MAX_POST_WORDS` / `MAX_BODY_CHARS` Truncation Behavior

## Problem Statement

CLAUDE.md's `/api/curate` section lists the request shape (`posts: SubstackPost[]`), constraints (`max 50 posts`, `lessonCount in [3, 5, 7, 10]`), and the SSE event table — but does not mention that the route silently truncates `bodyText` to `MAX_POST_WORDS = 2500` words *and* slices to `MAX_BODY_CHARS = 30_000` chars.

An agent author has no documented signal that they should pre-truncate to avoid silent mutation. The constants live in source (`src/lib/limits.ts`) but the API section of the doc doesn't reference them. (CLAUDE.md's "Key rules" section *does* document them — narrow this todo to "duplicate the values in the API contract section so agent readers don't have to cross-reference.")

Flagged by agent-native-reviewer (P2).

## Findings

**Location:** `CLAUDE.md` (the `### Step 2 — POST /api/curate` section).

## Proposed Solutions

### Option A: Add a Constraints bullet (recommended)

Under the existing `Constraints:` line in the curate section:

```markdown
Constraints: max 50 posts; `lessonCount` must be one of `[3, 5, 7, 10]`; `maxDuration = 180s`.

**Server-side truncation:** each post's `bodyText` is sliced to `MAX_BODY_CHARS = 30_000` chars
and then truncated to `MAX_POST_WORDS = 2500` words at the route boundary. The UI pre-truncates;
direct API callers are silently truncated. See `src/lib/limits.ts` for current values.
```

- Pros: One paragraph, source of truth for current behavior.
- Cons: Constant values can drift; doc may go stale.
- Effort: Trivial.

### Option B: Implement #173 (`/api/limits`) and reference it from the doc

```markdown
**Server-side truncation:** call `GET /api/limits` for current truncation thresholds.
```

- Pros: Single source of truth, no drift.
- Cons: Requires #173.
- Effort: Trivial doc change once #173 lands.

### Option C: Document plus link to constants

Combine A + B for belt-and-suspenders.

## Recommended Action

_Pending triage._ Option A immediately; upgrade to Option B if #173 lands.

## Technical Details

**Affected files:**
- `CLAUDE.md`

## Acceptance Criteria

- [ ] Agent author can read the doc and know that oversize `bodyText` will be truncated
- [ ] Cap values are findable from the doc (either inline or via reference)

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `CLAUDE.md` `/api/curate` section
- Related: #171 (silent mutation observability), #173 (/api/limits discovery)
