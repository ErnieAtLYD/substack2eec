---
status: complete
priority: p3
issue_id: "184"
tags: [code-review, performance, cost]
dependencies: []
---

# Wire AbortController into /api/curate fetch to stop server-side generation on early exit

`reader.cancel()` tears down the client read side, but nothing deterministically stops the server-side Anthropic stream — it may keep generating billable tokens to completion.

## Problem Statement

`ReviewForm.tsx` starts the curate request with plain `fetch` (no `AbortController`). On the `'error'` early-return path (and the overflow-throw path), the client stops reading, but `/api/curate` (`maxDuration = 180`) may keep streaming from Anthropic to completion. `reader.cancel()` *may* propagate backpressure/abort depending on browser + server, but it is not guaranteed the way `AbortController.abort()` on the fetch is. Wasted Anthropic compute, not a client-perf issue.

## Findings

- performance-oracle finding 4b: cancellation requests teardown of the client stream; abort propagation to the route handler (and from there to the Anthropic SDK stream) is not guaranteed cross-browser.
- Server side would also need to observe `request.signal` (Next.js Route Handlers expose it) and abort the Anthropic stream for the saving to be realized end-to-end.

## Proposed Solutions

### Option 1: AbortController on the fetch + server honors request.signal

**Approach:** Create an `AbortController`, pass `signal` to the curate `fetch`, call `controller.abort()` in the same cleanup path as `reader.cancel()`. In `/api/curate/route.ts`, listen to `request.signal` and abort the Anthropic stream / stop writing.

**Pros:** Deterministic end-to-end stop; saves real token cost on abandoned generations
**Cons:** Touches both client and route handler; needs care not to surface AbortError as a user-facing failure
**Effort:** 2-3 hours (incl. tests for the abort path)
**Risk:** Medium

---

### Option 2: Client-side abort only

**Approach:** Just the `AbortController` on the fetch; rely on the runtime to propagate.

**Pros:** Small, no server change
**Cons:** Propagation to the Anthropic stream still not guaranteed
**Effort:** 30 min
**Risk:** Low

## Recommended Action

Option 1 implemented end-to-end (user-confirmed scope): client AbortController + route observes `request.signal` + signal plumbed into both Anthropic SDK calls.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx` — curate fetch + cleanup path
- `src/app/api/curate/route.ts` — observe `request.signal` (Option 1)

## Resources

- **PR:** #32 (follow-up; explicitly out of scope for #149/#153)
- **Reviewer:** performance-oracle (finding 4b)

## Acceptance Criteria

- [ ] Early exit from the SSE loop aborts the underlying fetch
- [ ] AbortError is not surfaced as a user-facing error
- [ ] (Option 1) Route handler stops Anthropic generation when the client disconnects
- [ ] Full suite green

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #32)

**Learnings:**
- `reader.cancel()` and `fetch` abort are different layers: one frees the client connection, the other stops upstream work.

### 2026-06-04 - Resolution

**By:** Claude Code

**Actions:**
- `ai.ts`: `rewriteAsLesson` and `curatePostSelection` take trailing optional `signal?: AbortSignal`, forwarded as the SDK's 2nd-arg `RequestOptions` (`messages.stream(body, { signal })` / `messages.create(body, { signal })`); abort throws the SDK's `APIUserAbortError`
- `route.ts`: safe-`enqueue` (no-ops once `closed || signal.aborted`, latches `closed` if enqueue throws) + `safeClose`; `if (signal.aborted) break` before each lesson, inside the chunk loop, and before `parseLessonMarkdown`; catch gates on `signal.aborted` (NOT error type — covers both the SDK abort error and post-disconnect enqueue throws) so disconnects are never logged or emitted as `error` events
- `ReviewForm.tsx`: per-request `AbortController`, `signal` on the fetch, `controller.abort()` in a function-level `finally` — runs after the try settles, so it can't inject an AbortError into the catch; no-op after normal completion
- Tests (`src/__tests__/curate-route-abort.test.ts`): mid-stream abort (lesson 2 never starts, no error event, no log, stream closes) + abort during the curation step (zero events, no log). `NextRequest` forwards `signal` from RequestInit natively — no wrapper needed.
- Client-side abort unit test skipped as disproportionate (node-env, no fetch mock, handler closed over hooks); correctness is structural (`finally`) and the effect is pinned server-side

**Learnings:**
- Gate server teardown on `request.signal.aborted`, not on error type — abort manifests simultaneously as an SDK error and as enqueue-throws; one guard covers both races.
