---
status: done
priority: p2
issue_id: "004"
tags: [code-review, security, error-handling, information-disclosure]
dependencies: []
---

# Raw Error Messages Leak Internal Details Over SSE

## Problem Statement

All three API routes pass raw exception messages directly to the client — over SSE for `/api/curate`, as JSON for `/api/fetch-posts` and `/api/export`. The Anthropic SDK error messages include model names, token counts, and endpoint details. The curation flow additionally leaks a 300-char slice of raw AI response content when parsing fails.

**Why it matters:** Information disclosure is a pre-existing issue that is not introduced by this PR, but it is worth fixing before public launch. Internal error details help attackers understand the system and craft targeted payloads.

## Findings

**Location 1:** `src/app/api/curate/route.ts:61-62`
```typescript
const message = err instanceof Error ? err.message : 'Unknown error'
enqueue({ type: 'error', message })
```
Raw Anthropic SDK errors (e.g., `"400 Bad Request: max_tokens must not exceed model limit of 4096"`) go directly to the client.

**Location 2:** `src/lib/ai.ts` — `curatePostSelection` error message
```typescript
throw new Error(`Curation tool call failed … Raw: ${JSON.stringify(raw).slice(0, 300)}`)
```
This embeds a 300-char slice of the raw AI response (which may include internal content) in the error surfaced to the client.

**Location 3:** `src/app/api/fetch-posts/route.ts:27` (pre-existing)
Raw Substack API errors (including URL and status code) returned to client.

**Pre-existing or new?** Pre-existing — not introduced by this PR.

## Proposed Solutions

### Option A: Log full error server-side, return sanitized message (Recommended)
```typescript
} catch (err) {
  console.error('[curate] error:', err)
  const message = err instanceof Error && err.message.startsWith('No suitable posts')
    ? err.message  // safe, user-facing
    : 'An error occurred generating your course. Please try again.'
  enqueue({ type: 'error', message })
}
```
And in `ai.ts`:
```typescript
throw new Error('Curation response was incomplete or invalid')
// log the raw slice server-side only
```
- **Pros:** Hides internals, preserves useful logging, safe user message
- **Effort:** Small
- **Risk:** None

### Option B: Create an `AppError` class with a `userMessage` field
```typescript
class AppError extends Error {
  constructor(
    public readonly userMessage: string,
    message: string,
  ) { super(message) }
}
```
Catch `AppError` and use `userMessage`; for other errors, use a generic fallback.
- **Pros:** Explicit separation of internal vs. user-facing messages
- **Effort:** Medium
- **Risk:** None

## Recommended Action

Option A — minimal, targeted fix. Just ensure `console.error` captures the full error before stripping it for the SSE response. No need for a new class at this codebase size.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts:61-62`
- `src/lib/ai.ts` — curation error construction
- `src/app/api/fetch-posts/route.ts:27`

## Acceptance Criteria

- [ ] Anthropic SDK error details are not visible in SSE `error` events
- [ ] Raw AI response slices are not included in client-visible error messages
- [ ] Full errors are logged server-side (console.error)
- [ ] User-facing error messages are generic and helpful

## Work Log

- 2026-03-18: Finding created from code review of PR #1 (feat/custom-course-length) — pre-existing issue

## Resources

- PR #1: feat: custom course length picker
- Security reviewer finding: "P2 Error Messages Leak Internal Stack Information"
