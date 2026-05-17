---
status: pending
priority: p2
issue_id: "173"
tags: [code-review, agent-native, api-design]
dependencies: []
---

# No `/api/limits` Discovery Endpoint For `MAX_POST_WORDS`, `MAX_BODY_CHARS`, Etc.

## Problem Statement

Multiple constants gate the agent API: `MAX_POST_WORDS = 2500`, `MAX_BODY_CHARS = 15_000`, max 50 posts per request, allowed lesson counts `[3, 5, 7, 10]`. None are exposed via the API. An agent author who hard-codes `2500` to pre-truncate is at risk of drift the day a constant changes.

Flagged by agent-native-reviewer (P2).

## Findings

**Location:** values live in `src/lib/html-text.ts:3` (`MAX_POST_WORDS`), `src/types/index.ts` (`MAX_BODY_CHARS`, `ALLOWED_LESSON_COUNTS`), and `src/app/api/fetch-posts/route.ts` (max 50). Each is "exported" but only reachable by reading source.

## Proposed Solutions

### Option A: Add a `GET /api/limits` route (recommended)

```ts
// src/app/api/limits/route.ts
import { NextResponse } from 'next/server'
import { MAX_POST_WORDS } from '@/lib/html-text'
import { MAX_BODY_CHARS } from '@/types'

export const runtime = 'nodejs'

export function GET() {
  return NextResponse.json({
    maxPostWords: MAX_POST_WORDS,
    maxBodyChars: MAX_BODY_CHARS,
    maxPosts: 50,
    allowedLessonCounts: [3, 5, 7, 10] as const,
  })
}
```

Document in CLAUDE.md as `### Step 0 — GET /api/limits`.

- Pros: Zero-drift discovery. Aligns with the agent-native pattern (any UI capability is also an agent capability). Cheap.
- Cons: One more route; tiny attack surface (no inputs, no secrets).
- Effort: Small (~30 LOC + doc).

### Option B: Inline the limits in every error response that mentions them

When the route truncates or rejects, include the relevant cap in the error/event payload.

- Pros: Self-documenting at the point of failure.
- Cons: Requires #171 (event emission); doesn't help agents that want to pre-check.
- Effort: Folded into #171.

### Option C: Document constants in CLAUDE.md only

- Pros: Trivial; what #172 already proposes.
- Cons: Doc and code drift independently.
- Effort: Trivial.

## Recommended Action

_Pending triage._ Option A is the agent-native answer. Combine with #172 for the doc.

## Technical Details

**Affected files:**
- `src/app/api/limits/route.ts` (NEW)
- `CLAUDE.md` (new section)

## Acceptance Criteria

- [ ] `GET /api/limits` returns current cap values
- [ ] CLAUDE.md documents the endpoint as Step 0
- [ ] All constant values come from the same module the route enforcement uses (no duplication)

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/lib/html-text.ts:3`
- `src/types/index.ts` (`MAX_BODY_CHARS`)
- Related: #171, #172
