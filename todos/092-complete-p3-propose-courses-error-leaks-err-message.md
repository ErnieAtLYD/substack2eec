---
status: pending
priority: p3
issue_id: "092"
tags: [code-review, security, information-leakage]
dependencies: []
---

# `/api/propose-courses` Forwards Raw `err.message` to Client — Information Leakage

## Problem Statement

```ts
const message = err instanceof Error ? err.message : 'An error occurred proposing course candidates.'
return NextResponse.json({ error: message }, { status: 500 })
// src/app/api/propose-courses/route.ts:48–50
```

The Anthropic SDK can throw errors with messages that include API-level detail: authentication failure reasons, model names, rate limit headers, and partial request metadata. Forwarding `err.message` raw leaks internal stack state to the caller.

By contrast, `/api/curate/route.ts:131–133` already uses a guarded pattern that only forwards messages for known, safe error types.

## Findings

- `src/app/api/propose-courses/route.ts:48–50` — raw `err.message` forwarded
- `src/app/api/curate/route.ts:131–133` — better pattern (guarded forwarding)

**Source:** Security sentinel review

## Proposed Solutions

### Option A — Match the curate route pattern (Recommended)
Only forward the message for known error types; use a generic message otherwise:

```ts
const message = err instanceof Error && err.message.startsWith('Candidate proposal')
  ? err.message
  : 'Failed to generate course candidates. Please try again.'
```

Or simply always use a generic message and log the full error server-side.

**Effort:** Trivial | **Risk:** None

## Recommended Action

Option A — use a generic user-facing message, log full error server-side.

## Technical Details

**Affected files:**
- `src/app/api/propose-courses/route.ts:48–50`

## Acceptance Criteria

- [ ] Raw Anthropic SDK error messages not forwarded to client
- [ ] Full error logged server-side

## Work Log

- 2026-04-04: Found by security sentinel
