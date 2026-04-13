---
status: pending
priority: p2
issue_id: "101"
tags: [code-review, agent-native, rate-limiting, documentation, middleware]
dependencies: []
---

# CLAUDE.md Missing Rate Limit Values and Wrong Error Codes

## Problem Statement

The Agent API section of `CLAUDE.md` does not document any rate limit values or the `Retry-After` header, leaving agent consumers without the information needed to handle backpressure rationally. Additionally, `/api/fetch-posts` documents `503 (rate-limited)` but the middleware actually returns `429`. `/api/curate` and `/api/propose-courses` list no rate limit errors at all. An agent that hits the rate limiter has no documented basis for knowing the window length, the per-endpoint budget, or that a fixed retry-after is available.

## Findings

**Rate limits in `src/middleware.ts:26-31` (not documented in CLAUDE.md):**

| Endpoint | Limit |
|---|---|
| `/api/curate` | 5 req / 60s |
| `/api/fetch-posts` | 20 req / 60s |
| `/api/export` | 20 req / 60s |
| `/api/propose-courses` | 3 req / 60s |

The middleware also sets `Retry-After: 60` on all 429 responses — not documented anywhere.

**Wrong error code in CLAUDE.md:**
- `POST /api/fetch-posts` documents `503 (rate-limited)` — actual response is `429`

**Missing 429 entries:**
- `POST /api/curate` — no 429 in error table; 429 arrives as a non-SSE HTTP response before the stream opens
- `POST /api/propose-courses` — no 429 in error table

## Proposed Solutions

### Option A — Add "Rate limits" subsection + fix error codes (Recommended)

Add a table after the Agent API intro:

```markdown
### Rate limits

All endpoints return `429 Too Many Requests` when the limit is exceeded.
Response includes `Retry-After: 60`.

| Endpoint | Limit |
|---|---|
| `/api/curate` | 5 req / 60s |
| `/api/propose-courses` | 3 req / 60s |
| `/api/fetch-posts` | 20 req / 60s |
| `/api/export` | 20 req / 60s |

Limits are enforced per-IP in memory, per-instance. They reset on cold starts and are not shared across Vercel function instances.
```

Fix `/api/fetch-posts` error list: change `503 (rate-limited)` to `429 (rate-limited, Retry-After: 60)`.

Add `429 (rate-limited, Retry-After: 60)` to `/api/curate` and `/api/propose-courses`. For `/api/curate`, add a note: "429 arrives as a plain HTTP response before the SSE stream opens — handle it before reading the body as a stream."

- **Effort:** Small | **Risk:** None

### Option B — Inline notes on each endpoint only

Add a rate-limit note to each endpoint section without a shared table. More repetition but easier to find inline.

- **Effort:** Small | **Risk:** None

## Recommended Action

Option A. The shared table is easier to maintain and gives agents a single place to look.

## Technical Details

**Affected file:** `CLAUDE.md` (Agent API section)

## Acceptance Criteria

- [ ] CLAUDE.md includes correct rate limit values for all four endpoints
- [ ] CLAUDE.md mentions `Retry-After: 60` on 429 responses
- [ ] `/api/fetch-posts` error code corrected from `503` to `429`
- [ ] `/api/curate` documents `429` as a pre-stream HTTP error
- [ ] `/api/propose-courses` documents `429`
- [ ] Note added that limits are per-instance, in-memory, reset on cold start

## Work Log

- 2026-04-12: Found by agent-native-reviewer on PR #7
