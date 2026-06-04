---
title: "Client disconnect from /api/curate left Anthropic generation running to completion; the new frame cap was bypassable by malformed frames"
category: security-issues
related_issues:
  - "todos/184-complete-p3-abortcontroller-curate-fetch-stop-server-generation.md"
  - "todos/186-complete-p3-no-cap-on-sse-frame-count-accumulation.md"
  - "todos/187-complete-p3-frame-cap-bypassed-by-malformed-frames.md"
  - "todos/189-complete-p3-document-abort-terminal-state-in-agent-api.md"
related_prs:
  - "PR #33 (chore/182-186-sse-review-followups branch)"
fix_commits:
  - "4697a61 fix(sse): resolve P3 review follow-ups from PR #32 (#182-#186) (#33) — squash of the abort wiring, frame cap, #187 hardening, and docs"
tags:
  - dos
  - resource-leak
  - sse
  - streaming
  - abort-controller
  - cancellation
  - anthropic-sdk
  - token-spend
  - async-generator
  - trust-boundary
date_solved: 2026-06-04
---

# Client disconnect left Anthropic generation running; the frame cap was bypassable by malformed frames

When a client disconnected from the `POST /api/curate` SSE stream (`maxDuration = 180s`), server-side Anthropic generation kept running to completion — full token cost for a course no one would read. PR #32's `reader.cancel()` only released the *client* side; nothing told the server to stop. PR #33 wires client-disconnect abort through the entire pipeline: an `AbortController` on the client fetch (with `abort()` in a function-level `finally` so it runs only after the stream settles and can't mask diagnostics), a route handler that observes `request.signal` with safe-enqueue/safeClose, and the signal threaded into the Anthropic SDK via `RequestOptions`. The load-bearing design choice: server teardown gates on `signal.aborted`, not on error *type* — an abort surfaces simultaneously as the SDK's `APIUserAbortError` and as `enqueue` throwing post-disconnect, and one signal-based guard covers both races. A convergent three-agent review of the same PR then caught a cap-bypass it introduced (#187): the new `MAX_SSE_FRAMES` counter incremented only on successfully *parsed* frames, so terminated-but-malformed `data:` frames drained the byte buffer (dodging the byte cap) while skipping the count (dodging the frame cap) — an unbounded loop slipping past both guards. The fix counts every `data:` frame *before* parsing: cap what you process, not what you yield. Because `request.signal` fires for any transport-level disconnect — not just the UI's `AbortController` — agent callers get cancellation for free, now documented in CLAUDE.md alongside the new terminal state (aborted streams end with no `done`/no `error`).

## Root Cause

### A. `reader.cancel()` frees only the client; the server kept burning tokens (#184)

Before this change, a user navigating away mid-generation broke the consumer loop and the SSE generator's `finally` called `await reader.cancel()`. That releases the *client's* half of the connection, but is invisible to the server:

- Nothing on the server read `request.signal`. The `ReadableStream` `start(controller)` body ran to completion regardless of whether anyone was listening.
- The Anthropic SDK calls inside `curatePostSelection` / `rewriteAsLesson` carried **no `signal`** in their `RequestOptions`, so the SDK could not abort the in-flight request to the model.

Net effect: a disconnect cancelled the *display* of tokens; the model kept generating every remaining lesson and the account was billed for all of it. The cancel signal died at the network boundary. The fix requires an unbroken chain: client `AbortController` → `fetch({ signal })` → server `request.signal` → loop guards → SDK `{ signal }`. Breaking the chain anywhere leaves tokens burning.

### B. The frame cap counted units *consumed*, not units *processed* (#187)

The frame counter was initially incremented only after a successful `JSON.parse`. That left a gap:

- A *terminated-but-malformed* frame (`data: {not-valid-json\n\n`) is split off by `\n\n`, so it **drains the buffer** every iteration — the byte cap (#149) never trips.
- Its `JSON.parse` throws into the skip-malformed `catch`, so the counter never increments — the frame cap (#186) never trips either.

An endless flood of malformed-but-terminated frames evaded *both* caps and pinned the parse loop forever. The general principle: **a cap must count units PROCESSED, not units successfully CONSUMED** — the counter must be driven by the thing whose volume the attacker controls (frames arriving), never by the happy path (frames parsing cleanly).

## Working Solution

### Three load-bearing design decisions

**(a) Gate teardown on `signal.aborted`, not error type** — `src/app/api/curate/route.ts`

Abort surfaces in two shapes depending on timing: the SDK throws `APIUserAbortError` (an `Error` with no numeric `status`), but it can also manifest as `controller.enqueue` throwing once the client socket is gone. The catch inspects the signal instead of pattern-matching either error:

```ts
} catch (err) {
  if (signal.aborted) {
    // Client disconnected — expected teardown, not a failure: no log,
    // no error event (there is no one left to read it anyway).
  } else {
    logError('[curate] stream error:', err)
    const message = /* quota / no-suitable-posts / generic */
    enqueue({ type: 'error', message })
  }
}
```

The loop is also guarded at every spend boundary so it stops promptly rather than waiting for a throw:

```ts
for (const curatedLesson of selection.lessons) {
  if (signal.aborted) break
  // ...
  for await (const chunk of rewriteAsLesson(post, lessonNum, total, selection, completedLessons, signal)) {
    if (signal.aborted) break
    fullMarkdown += chunk
    enqueue({ type: 'lesson_chunk', lessonNumber: lessonNum, text: chunk })
  }
  if (signal.aborted) break // don't parse/emit a partial lesson_done
  // ...
}
```

**(b) `abort()` lives in the function-level `finally`, after the `try` settles** — `src/components/features/ReviewForm.tsx`

```ts
const abortController = new AbortController()
try {
  const res = await fetch('/api/curate', { /* ... */, signal: abortController.signal })
  // ... consume parseSSEStream(res.body.getReader()) ...
} catch (e) {
  console.error('curate stream failed:', e)
  recoverFromStreamException()
} finally {
  // Runs after the try has already returned/thrown, so this can never
  // inject an AbortError into the catch above; after normal completion
  // it's a no-op on the settled fetch.
  abortController.abort()
}
```

Placement is deliberate: the `finally` runs *after* the `try` resolved or rejected, so `abort()` can never replace the real stream diagnostics (e.g. the #149 buffer-cap throw) with an `AbortError` in the `catch`. On normal completion the fetch is settled, so `abort()` is a harmless no-op. Aborting on *every* exit path is what makes the server's `request.signal` fire deterministically — `reader.cancel()` alone only frees the client side.

**(c) Safe-enqueue / safeClose with a monotonic `closed` latch** — `src/app/api/curate/route.ts`

```ts
let closed = false
const enqueue = (event: CurateSSEEvent) => {
  if (closed || signal.aborted) return
  try {
    controller.enqueue(encoder.encode(sseEvent(event)))
  } catch {
    closed = true // client vanished mid-flush
  }
}
const safeClose = () => {
  if (closed) return
  closed = true
  try { controller.close() } catch { /* already closed/errored */ }
}
```

`closed` is monotonic (only flips `false → true`) and the stream body is single-threaded — interleaving happens only at `await` points, never re-entrantly. An `enqueue` inside the catch block can't double-throw and escape; `safeClose` in the `finally` can't throw on an already-errored controller. The teardown path is total — no exit leaves the stream wedged or surfaces a secondary exception.

### SDK signal plumbing — `src/lib/ai.ts`

Both model entry points accept a trailing optional `signal` and forward it in the SDK's `RequestOptions` second argument:

```ts
export async function curatePostSelection(posts, lessonCount, signal?: AbortSignal) {
  const response = await getClient().messages.create({ /* ... */ }, { signal })
}

export async function* rewriteAsLesson(post, lessonNum, total, selection, priorLessons, signal?: AbortSignal) {
  const stream = getClient().messages.stream({ /* ... */ }, { signal })
}
```

This is the link that actually stops token spend: the SDK aborts the in-flight HTTP request to the model when the signal fires.

### Frame cap counts processed frames — `src/components/features/ReviewForm.tsx`

The increment moved *ahead* of the parse; `maxFrames` is overridable so tests pin the cap with 6-frame fixtures instead of 100k (the #183 lesson — decouple fixture cost from tunable caps):

```ts
{ maxFrames = MAX_SSE_FRAMES }: { maxFrames?: number } = {},
// ...
for (const part of parts) {
  if (!part.startsWith('data: ')) continue
  if (frameCount >= maxFrames) {
    throw new Error('SSE frame count exceeded cap — upstream emitting unbounded events')
  }
  frameCount++                                   // counted BEFORE parse (#187)
  try {
    yield JSON.parse(part.slice(6)) as CurateSSEEvent
  } catch {
    // Malformed frame — skip, matching prior behavior.
  }
}
```

### Abort ≠ failure

A client disconnect is expected teardown, not an error. On abort the server emits **no `logError`** (routine navigation would pollute logs) and **no `error` SSE event** (no consumer left to read it). The aborted stream's terminal state is distinctive: **no `done`, no `error` — it simply closes.** This is documented in `CLAUDE.md` as an agent-usable capability: any client can abort its connection to stop generation, and must not treat a stream that closes without `done`/`error` after its own disconnect as a failure.

### Test patterns

`src/__tests__/curate-route-abort.test.ts`:

- **`rejectOnAbort(signal)`** — the core SDK model: a promise that never resolves and rejects with an `APIUserAbortError`-shaped error the moment the signal fires. The mocked `rewriteAsLesson` yields one chunk then `await rejectOnAbort(signal)` — mimicking a real SDK stream that hangs until aborted, then throws.
- **Mid-stream abort**: read until `lesson_chunk` arrives, `controller.abort()`, drain to completion; assert the stream closed (didn't hang), no `error` event, no `done` event, lesson 2 never started, no error log.
- **Curation-step abort**: `curatePostSelection` rejects on abort; assert zero SSE events and nothing logged.

`parseSSEStream.test.ts`:

- **Malformed-flood trip (#187)**: six `data: {not-valid-json\n\n` frames through `{ maxFrames: 5 }` → rejects with `/frame count/`. This is the regression guard a valid-frame flood test cannot provide — the count-after-parse bug passes a valid-flood test.

### What the abort does NOT save

- **The non-streaming curation call's tokens.** `curatePostSelection` uses `messages.create`; by the time the response returns, the model already produced the full output. Aborting during curation cancels the *wait*, not the *spend*. (Aborting during the streaming lesson rewrites saves the remainder.)
- **In-flight chunk granularity.** Abort stops at chunk boundaries; the current chunk may still be billed. Only subsequent lessons/chunks are reliably saved.

## Prevention

These extend (not duplicate) the growth-dimension checklist in [client-sse-unbounded-buffer-oom-and-reader-leak.md](client-sse-unbounded-buffer-oom-and-reader-leak.md) — and close that doc's two explicitly-waived items (frame count, resource abort).

### 1. Streaming-cost checklist (cancellation must reach the cost source)

Any server route that streams *expensive* work (LLM tokens, long compute) must:

- [ ] Read `request.signal` at the top of the stream body and **thread it all the way to the cost source** — not just check it locally. The SDK's `RequestOptions.signal` is what stops upstream generation.
- [ ] Re-check `signal.aborted` at every loop boundary that gates new spend. One top-level check is not enough — a multi-second loop can spend after the client is gone.
- [ ] On the client, every `fetch` to such a route carries an `AbortController` aborted in a function-level `finally`, so disconnect/early-return/throw all fire the server signal deterministically.

> **"reader.cancel() is not abort."** Distinct layers: `reader.cancel()` frees the client-side stream plumbing only. Only `AbortController.abort()` → `request.signal` stops server spend. Thread *both*: cancel the reader (release the socket) **and** abort the controller (stop the work).

### 2. Abort-handling rules (teardown is not failure)

- [ ] Gate teardown on `signal.aborted`, not error type — abort surfaces as both an SDK error and an enqueue throw; one signal guard covers both.
- [ ] Abort is teardown: no log, no error frame. Logging aborts pollutes diagnostics with normal client behavior; emitting to a dead socket is wasted and can itself throw.
- [ ] Client `abort()` goes in `finally`, after the `try` settles — it can never mask the real diagnostic in the `catch`.
- [ ] Wrap stream-controller writes in safe-enqueue/safeClose (monotonic `closed` latch + try/catch) — a controller can outlive its reader, and post-abort writes must degrade to no-ops, not crash the teardown path.

### 3. Cap-counting rule (the #187 lesson)

- [ ] **Count units PROCESSED at the boundary, not units successfully consumed downstream.** The counter must be driven by the thing whose volume the attacker controls (frames arriving), never the happy path (frames parsing cleanly) — otherwise the failure mode (malformed input) is exactly what bypasses the cap.
- [ ] **Pin it with a malformed-flood trip test**, not just a well-formed flood: a valid-frame test passes even against the buggy count-after-parse version, so it proves nothing about the failure mode.

### 4. Contract rule (terminal-state changes are contract changes)

- [ ] When teardown changes a stream's terminal states, update the documented event contract **in the same PR**. After this change an aborted curate stream emits neither `done` nor `error` — a consumer implementing "no `done` ⇒ failure" would silently mis-report its own disconnect. The SSE event table and parse-loop guidance in `CLAUDE.md` are part of the change surface.

## References

- This PR: https://github.com/ErnieAtLYD/substack2eec/pull/33 (merge `4697a61`)
- Prior sibling: https://github.com/ErnieAtLYD/substack2eec/pull/32

### Sibling solution doc (this doc closes its waived checklist items)
- `docs/solutions/security-issues/client-sse-unbounded-buffer-oom-and-reader-leak.md` — PR #32's writeup; its Prevention §1 waived frame *count* (todo 186) and noted the abort layer (todo 184) — both closed here.

### Directly resolved (completed todos)
- `todos/184-complete-p3-abortcontroller-curate-fetch-stop-server-generation.md` — the abort-wiring half
- `todos/186-complete-p3-no-cap-on-sse-frame-count-accumulation.md` — the frame-count cap
- `todos/187-complete-p3-frame-cap-bypassed-by-malformed-frames.md` — the count-before-parse hardening
- `todos/189-complete-p3-document-abort-terminal-state-in-agent-api.md` — the contract note

### Same review batch (supporting)
- `todos/182-complete-p3-limits-client-import-footgun-and-doc-updates.md` — limits.ts `server-only` exception docs
- `todos/183-complete-p3-tighten-parsessestream-cap-tests.md` — fixture/constant decoupling
- `todos/185-complete-p3-bare-catch-discards-stream-error-diagnostics.md` — diagnostics preserved

### Open follow-ups (pending, not resolved)
- `todos/188-pending-p3-extract-shared-curate-route-test-harness.md` — shared curate-route test harness
- `todos/190-pending-p3-pr33-review-polish-batch.md` — review polish nits

### Other related docs
- `docs/solutions/runtime-errors/anthropic-tool-use-max-tokens-truncation.md` — the `max_tokens` bound that sizes the frame caps
- `docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md` — the #146 cap-regression precedent
- `docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md` — trust-boundary cap discipline

### Source files
- `src/components/features/ReviewForm.tsx` — AbortController wiring + frame cap
- `src/app/api/curate/route.ts` — safe-enqueue/safeClose + signal guards
- `src/lib/ai.ts` — SDK signal plumbing
- `src/lib/limits.ts` — `MAX_SSE_FRAMES` rationale
- `src/__tests__/curate-route-abort.test.ts`, `src/components/features/__tests__/parseSSEStream.test.ts` — pinning tests
