---
title: "Client-side parseSSEStream buffered unbounded SSE bytes (tab OOM) and never cancelled the reader on exit"
category: security-issues
related_issues:
  - "todos/149-complete-p2-parsessestream-unbounded-buffer.md"
  - "todos/153-complete-p2-sse-reader-not-cancelled-on-early-exit.md"
  - "todos/181-complete-p2-move-reader-cancel-into-parsessestream-finally.md"
related_prs:
  - "PR #32 (fix/149-153-sse-buffer-cap-reader-cancel branch)"
fix_commits:
  - "6fe0d1f fix(sse): bound parseSSEStream buffer + cancel reader on exit (#149, #153) (#32) — squash of the buffer cap, the generator-finally refactor (todo 181), and the review todos"
tags:
  - dos
  - oom
  - resource-leak
  - sse
  - streaming
  - trust-boundary
  - async-generator
  - refactor-hazard
date_solved: 2026-06-04
---

# Client-side `parseSSEStream` buffered unbounded SSE bytes (tab OOM) and never cancelled the reader on exit

Two defects lived in the client-side `parseSSEStream` async generator that decodes the `/api/curate` SSE response in `src/components/features/ReviewForm.tsx`. First (#149), the generator accumulated incoming bytes into a `buffer` string with no upper bound, splitting off complete `\n\n`-terminated frames as they arrived — but if the upstream response never emitted a frame terminator (a CDN HTML error page, a misbehaving proxy, or a single giant chunk), the buffer grew without limit until the browser tab ran out of memory. Second (#153), the `ReadableStreamDefaultReader` was never cancelled on any exit path, so the underlying connection stayed open until garbage collection. A multi-agent code review (todo 181) surfaced a third, subtler issue: the initial #153 fix acquired the reader and wrapped cancellation in a `try/finally` at the call site (the React component), which is the wrong altitude — `for await...of` exit via `break`/`return`/`throw` invokes the iterator's `.return()`, which resumes the generator at *its own* `finally`, so cancellation belonged inside the generator to cover every exit path and every consumer (including the test helper, whose reader the call-site version leaked).

## Root Cause

### #149 — Unbounded reassembly buffer (tab OOM)

`parseSSEStream` accumulates decoded bytes into a `buffer` string, then splits on the SSE frame delimiter `\n\n`:

```ts
buffer += decoder.decode(value, { stream: true })
const parts = buffer.split('\n\n')
buffer = parts.pop() ?? ''   // last element is the incomplete remainder
```

`split('\n\n')` yields N+1 segments for N delimiters; `parts.pop()` removes the final segment — the *unterminated remainder* — and puts it back into `buffer` to be prefixed onto the next chunk. Completed frames are drained out of `buffer` each iteration. The trap: **if the response never emits a `\n\n`** (a CDN error page, a misbehaving proxy, one giant chunk), `split` produces a single-element array, `pop()` returns that whole string, and it is reassigned straight back to `buffer`. Nothing is ever drained. Each `read()` appends more bytes, and `buffer` grows monotonically until the tab runs out of memory. (The whole-buffer re-split is also O(n²) on such a stream — only made safe by the cap below.)

### #153 — Leaked `ReadableStreamDefaultReader`

The original code obtained a reader and consumed it with `for await`, but on any early exit — the `done`/`error` events `return` from the loop, a thrown error, or the consumer simply stopping — the reader was abandoned. Abandoning a `ReadableStreamDefaultReader` does **not** close the underlying stream: the lock is held and the network connection lingers until garbage collection eventually reclaims it. For a streaming `/api/curate` request that can run up to 180s, that is a real leaked connection per generation, not a theoretical one.

## Working Solution

### Key design decision: cap the unterminated remainder, not cumulative throughput

The fix bounds `buffer.length` *after* completed frames have already been popped off:

```ts
const parts = buffer.split('\n\n')
buffer = parts.pop() ?? ''
if (buffer.length > MAX_SSE_BUFFER_CHARS) {
  throw new Error('SSE buffer exceeded cap without a frame terminator — upstream response malformed')
}
```

This is the load-bearing distinction. A naive "total bytes seen" counter would falsely trip on a legitimate long course (many lessons × many KB each). But `buffer` only ever holds the *current incomplete frame* — every well-formed frame ending in `\n\n` is popped out and the buffer is drained back down that same iteration. So the cap can only be exceeded by a single frame that genuinely never terminates, which is exactly the malformed-upstream case we want to reject. The threshold is generous (`MAX_SSE_BUFFER_CHARS = 1_000_000`), ~35× larger than any real `lesson_done` frame (lesson rewrites are bounded by `max_tokens: 2048` in `src/lib/ai.ts`).

The `src/lib/limits.ts` comment encodes this reasoning as the single source of truth:

```ts
// DoS bound on the SSE reassembly buffer in parseSSEStream: the largest
// incomplete frame (no \n\n terminator yet) we will hold before concluding the
// upstream /api/curate response is malformed (CDN error page, proxy, one giant
// chunk) and bailing. A single legitimate lesson_done frame is far under this;
// the cap is on the unterminated remainder, not cumulative throughput.
export const MAX_SSE_BUFFER_CHARS = 1_000_000 as const
```

### Altitude lesson: generator-owned `finally`, not call-site `try/finally`

The reader leak (#153) is fixed by cancelling inside the generator's *own* `finally`, not at the call site. The mechanism that makes this correct: when a `for await...of` loop exits for **any** reason — `break`, `return`, or a thrown error — the JS runtime calls the async iterator's `.return()` method. For a generator, `.return()` resumes the suspended generator and runs its `finally` block. So a single `finally` inside the generator covers every exit path: natural `done`-return, the consumer breaking/returning early, and the overflow `throw` from the cap above.

Final `parseSSEStream` skeleton (from the merged code):

```ts
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<CurateSSEEvent> {
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      if (buffer.length > MAX_SSE_BUFFER_CHARS) {
        throw new Error('SSE buffer exceeded cap without a frame terminator — upstream response malformed')
      }
      for (const part of parts) {
        if (!part.startsWith('data: ')) continue
        try {
          yield JSON.parse(part.slice(6)) as CurateSSEEvent
        } catch {
          // Malformed frame — skip, matching prior behavior.
        }
      }
    }
  } finally {
    // Runs on every exit path — done-return, consumer break/return (via
    // iterator .return()), and the overflow throw — so the network
    // connection is released instead of lingering until GC (#153).
    // cancel() on an already-closed stream is a benign no-op/rejection.
    await reader.cancel().catch(() => {})
  }
}
```

The call site stayed dead simple — it passes a fresh reader into the generator and never touches lifecycle:

```ts
for await (const event of parseSSEStream(res.body.getReader())) {
  const outcome = applyCurateEvent(event, inProgressLessons)
  if (outcome.status === 'done') return
  if (outcome.status === 'error') { /* set error, set step, */ return }
}
```

The `.catch(() => {})` on `reader.cancel()` swallows the benign rejection from cancelling an already-closed stream.

### Test patterns

Three tests in `src/components/features/__tests__/parseSSEStream.test.ts` pin the contract:

**Overflow throws (#149)** — one oversized chunk with no terminator must reject:

```ts
const reader = makeReader([enc.encode('data: ' + 'x'.repeat(MAX_SSE_BUFFER_CHARS + 1))])
await expect(collect(reader)).rejects.toThrow(/SSE buffer/)
```

**Cumulative valid frames do *not* throw (#149)** — the guard against a throughput-counter regression. Total bytes deliberately exceed `2 × MAX_SSE_BUFFER_CHARS`, but each frame ends in `\n\n` so the buffer drains every iteration:

```ts
const oneFrame = `data: ${JSON.stringify({ type: 'lesson_start', lessonNumber: 1 })}\n\n`
const frameCount = Math.ceil((MAX_SSE_BUFFER_CHARS * 2) / oneFrame.length)
const chunks = Array.from({ length: frameCount }, () => enc.encode(oneFrame))
const events = await collect(makeReader(chunks))
expect(events).toHaveLength(frameCount)
```

**Early-exit cancellation (#153)** — a `cancel()` spy on the underlying source plus a `break` proves the generator's `finally` fires through the iterator-`.return()` path. The stream is intentionally never `close()`d, so only `cancel()` can flip the flag:

```ts
let cancelled = false
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'lesson_start', lessonNumber: 1 })}\n\n`))
    // Intentionally never closed — only cancel() releases it.
  },
  cancel() { cancelled = true },
})
for await (const event of parseSSEStream(stream.getReader())) {
  void event
  break // early exit → iterator .return() → generator finally → reader.cancel()
}
expect(cancelled).toBe(true)
```

### What didn't work / was rejected

The first #153 fix (review todo 181) hoisted the reader up to the call site and wrapped the `for await` loop in a call-site `try/finally` to cancel it. This was the wrong altitude:

- **Split ownership.** The generator created and read the reader but the call site was responsible for releasing it — two places had to agree on lifecycle, and any future second caller would have to re-implement the cleanup.
- **Missed the test consumer.** The unit-test helper (`collect`) is a second `for await` consumer that the call-site `try/finally` did not cover, so it kept leaking its reader. Moving cleanup *into* the generator fixed that consumer for free.
- **More bookkeeping for less coverage.** It added ~10 lines of hoisting and finally-block plumbing at the call site while a single generator-owned `finally` covers every consumer and every exit path via `.return()`.

## Prevention

### 1. Bound every growth dimension in stream/accumulator code

A stream read-loop has more than one thing that can grow without bound. PR #32 capped frame *size* but the same loop still has unbounded frame *count* (open todo 186). Before shipping any read-loop, enumerate each axis and either bound it or consciously waive it with a one-line comment:

- [ ] **Unterminated remainder** (`buffer` between delimiters) — capped via a named constant? ✅ `MAX_SSE_BUFFER_CHARS`
- [ ] **Frame / event count** — bounded or consciously waived? ⚠️ currently unbounded (todo 186)
- [ ] **Cumulative accumulated state** (events pushed, lessons collected) — bounded or waived?
- [ ] **Per-chunk parse cost** — the O(n²) whole-buffer re-split is only safe *because* of the size cap; note that coupling so the cap can't be removed (or raised hugely) in isolation
- [ ] **Resource handles** (reader/decoder) — released on every exit path? (see #2)

The rule: capping one dimension is not "fixing the OOM," it's relocating it. Name the neighbor you didn't cap.

### 2. Resource ownership: release in the generator's own `finally`

Whoever acquires a reader/handle that a generator consumes should be released in **that generator's** `finally`, not at the call site. The generator-finally fires on all exit paths — natural `done`, consumer `break`/`return` (via for-await → iterator `.return()` → generator finally), and any `throw`. Call-site cleanup only covers the one consumer the call site can see and silently misses secondary consumers (tests, future callers). If the generator reads it, the generator closes it.

### 3. Test patterns for caps and cancellation

- **Cap semantics need two cases, not one.** Pin a **trip** case (one unterminated frame past the cap → expect the diagnostic throw) *and* a **no-trip / drain** case (cumulative bytes far exceed the cap but each frame terminates → expect clean draining). A trip-only test still passes if someone regresses the check to cumulative throughput — the drain test is what catches it.
- **Pin cancellation directly.** Use an underlying-source `cancel()` spy and assert it fires on early consumer exit. A test that only checks emitted events won't catch a regressed `finally`.
- **Decouple fixture sizes from tunable constants.** Fixtures derived as `MAX_SSE_BUFFER_CHARS * 2` silently rescale when the cap is tuned (todo 183) — a generous bump can quietly turn the test into a multi-MB allocation monster.
- **Preserve the diagnostic.** When code deliberately `throw`s a diagnostic message, don't let a bare `catch {}` upstream destroy the signal the throw exists to surface (todo 185). `catch(() => {})` is only acceptable on known-benign operations like cancelling an already-closed stream — and the comment should say why.

### 4. Cap-placement convention in this repo

All trust-boundary and resource caps live as named `as const` constants in `src/lib/limits.ts`, each with a rationale comment stating *what* it bounds, *why that number*, and *which constraint actually binds*. `limits.ts` intentionally does **not** import `server-only` — it holds constants, not secrets — which is what lets the client (`ReviewForm.tsx`) import the SSE cap. That exception is now load-bearing (todo 182): a future "fix" adding `server-only` to satisfy the blanket CLAUDE.md rule would break the client build.

## References

- PR: https://github.com/ErnieAtLYD/substack2eec/pull/32

### Directly resolved
- `todos/149-complete-p2-parsessestream-unbounded-buffer.md` — the #149 resolution (buffer cap)
- `todos/153-complete-p2-sse-reader-not-cancelled-on-early-exit.md` — the #153 resolution (reader cancellation)
- `todos/181-complete-p2-move-reader-cancel-into-parsessestream-finally.md` — refinement: generator-owned `finally`

### Open follow-ups from the PR #32 review
- `todos/182-pending-p3-limits-client-import-footgun-and-doc-updates.md` — document the `limits.ts` client-import exception
- `todos/183-pending-p3-tighten-parsessestream-cap-tests.md` — decouple cap tests from the cap constant + boundary case
- `todos/184-pending-p3-abortcontroller-curate-fetch-stop-server-generation.md` — `AbortController` to stop server-side generation on early exit
- `todos/185-pending-p3-bare-catch-discards-stream-error-diagnostics.md` — log the swallowed stream-error reason
- `todos/186-pending-p3-no-cap-on-sse-frame-count-accumulation.md` — pre-existing: frame *count* still unbounded

### Related solution docs
- `docs/solutions/runtime-errors/streamlog-parsing-source-error.md` — same component, SSE streaming/progress tracking
- `docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md` — the #146 cap-regression precedent; same "assert, don't silently re-truncate" discipline
- `docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md` — trust-boundary cap discipline at the route/AI boundary
- `docs/solutions/runtime-errors/anthropic-tool-use-max-tokens-truncation.md` — adjacent truncation failure mode on the same lesson stream

### Source files
- `src/components/features/ReviewForm.tsx` — `parseSSEStream` (cap + generator-finally cancel) and call site
- `src/lib/limits.ts` — `MAX_SSE_BUFFER_CHARS` with rationale comment
- `src/components/features/__tests__/parseSSEStream.test.ts` — the three pinning tests
