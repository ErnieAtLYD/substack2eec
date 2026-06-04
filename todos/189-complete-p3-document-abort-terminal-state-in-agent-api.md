---
status: complete
priority: p3
issue_id: "189"
tags: [code-review, documentation, agent-native]
dependencies: []
---

# Document the abort terminal state in CLAUDE.md's Agent API (no `done` on disconnect)

PR #33 changed the documented `/api/curate` contract for the first time: an aborted stream now closes with **no further events** — no `done`, no `error`. CLAUDE.md still calls `done` the "Final event."

## Problem Statement

The agent-native review (PASS otherwise) found one parity-relevant gap: the canonical parse loop in CLAUDE.md breaks only on `done`/`error`, so an agent implementing "no `done` → the call failed" retry logic would misclassify its own deliberate disconnect as a failure. Conversely, early termination is now a real, agent-usable capability (closing the connection stops generation and token spend — `request.signal` fires for any client, not just the UI's AbortController) and it's undocumented.

## Findings

- agent-native-reviewer: parity holds in behavior (transport-level cancellation is automatically shared); the gap is purely documentation
- Suggested wording: "disconnecting the HTTP connection cancels generation server-side — the in-flight Anthropic request is aborted and token spend stops. An aborted stream closes with no further events (no `done`, no `error`); only a connection that runs to completion is guaranteed to end with `done`. Use this to stop a course you no longer need."

## Proposed Solutions

### Option 1: Add the note to the curate section

**Approach:** Insert the note near the SSE event table / after the Parse SSE snippet in CLAUDE.md; mention it works for any client.

**Pros:** Closes the "Final event" ambiguity; advertises the capability
**Cons:** None
**Effort:** 10 min
**Risk:** Low

## Recommended Action

Option 1 implemented.

## Technical Details

**Affected files:**
- `CLAUDE.md` — Agent API, Step 2 (curate) section

## Resources

- **PR:** #33
- **Reviewer:** agent-native-reviewer (Warning)

## Acceptance Criteria

- [ ] CLAUDE.md states the abort terminal state (no done/no error)
- [ ] Early termination documented as available to any client

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #33 — agent-native-reviewer)

### 2026-06-04 - Resolution

**By:** Claude Code

**Actions:**
- CLAUDE.md curate section: added the abort terminal-state note after the Parse SSE snippet — disconnect cancels generation and token spend, works for any client via `request.signal`, aborted streams end with no `done`/`error`, and a missing `done` after your own disconnect is not a failure
