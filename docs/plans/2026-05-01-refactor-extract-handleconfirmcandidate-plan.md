---
title: Extract handleConfirmCandidate into smaller functions
type: refactor
status: completed
date: 2026-05-01
---

# Extract `handleConfirmCandidate` into smaller functions

## Overview

`handleConfirmCandidate` in `src/components/features/ReviewForm.tsx:182-272` (91 lines) was
flagged with a cognitive complexity of 34 by the `fallow` skill (static analysis for JS/TS,
including complexity hotspots). Note: this metric is **not** enforced by the repo's
`eslint.config.mjs` — that config uses only `next/core-web-vitals` + `next/typescript`, so
`npm run lint` will not surface or re-verify the score. Verification of the post-refactor
score requires re-running `fallow`. The function mixes five concerns into one body: (1) UI/session state setup, (2) firing the curate POST,
(3) reading and decoding the SSE byte stream, (4) dispatching on five SSE event types, and
(5) recovering from network/stream failures. Each `else if` branch and nested `try`/`while`/`for`
adds to the score.

This refactor splits the function into a small set of pure helpers + a thinner orchestrator,
without changing behavior or external API. The file remains 611 LOC and the component continues
to drive the flow — only the internal structure changes.

## Problem Statement

`ReviewForm.tsx:182` violates the cognitive-complexity rule. The branching structure makes the
function:

- Hard to follow on review (the SSE event chain is buried inside two nested loops inside a
  `try`/`catch`).
- Hard to test in isolation (SSE parsing, event dispatch, and React state mutation are
  interwoven; you can't unit-test the parser without mounting the component).
- Hard to extend (adding a new SSE event type means adding another `else if` branch and pushes
  complexity higher).

The fallow score is the immediate trigger; clearer seams for testing and future SSE event
types is the durable benefit.

## Proposed Solution

Extract three helper functions from the body of `handleConfirmCandidate`. Two are pure (testable
without React); one wraps the React state-mutating dispatch and stays inside the component
closure. The orchestrator shrinks to ~25 lines and reads as: prepare → start request → consume
stream → handle terminal outcome.

### Target structure

1. **`parseSSEStream(reader, decoder)`** — module-scope async generator. Yields parsed
   `CurateSSEEvent` values from a `ReadableStreamDefaultReader<Uint8Array>`. Owns buffering,
   `\n\n` splitting, `data: ` prefix stripping, and per-frame `JSON.parse` (silently skipping
   malformed frames, matching today's behavior at `ReviewForm.tsx:222-226`). No React, no state
   — pure parser.

2. **`applyCurateEvent(event, ctx)`** — closure inside the component that dispatches one SSE
   event to React state. Returns a discriminated result so the loop knows whether to keep
   reading: `{ status: 'continue' } | { status: 'done' } | { status: 'error', message: string }`.
   The `error` case carries the message so the orchestrator can decide whether to fall back to
   partial lessons (matches today's branch at `ReviewForm.tsx:243-254`).

3. **`recoverFromStreamException()`** — closure inside the component. Implements today's
   `catch` block at `ReviewForm.tsx:257-271`: tries `readSessionLessons()` / `readSessionMeta()`
   first, falls back to network-error toast otherwise.

### Pseudo-code skeleton

```ts
// Module scope — pure, testable.
async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<CurateSSEEvent> {
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      if (!part.startsWith('data: ')) continue
      try {
        yield JSON.parse(part.slice(6)) as CurateSSEEvent
      } catch {
        // Malformed frame — skip, matching prior behavior.
      }
    }
  }
}

// Inside the component body.
type CurateOutcome =
  | { status: 'continue' }
  | { status: 'done' }
  | { status: 'error'; message: string }

function applyCurateEvent(
  event: CurateSSEEvent,
  inProgressLessons: GeneratedLesson[],
): CurateOutcome {
  switch (event.type) {
    case 'selection':
      setStreamLog(prev => [...prev, { text: `Course: "${event.data.courseTitle}"`, done: false }])
      return { status: 'continue' }
    case 'lesson_start':
      setStreamLog(prev => [...prev, { text: `Writing lesson ${event.lessonNumber}…`, done: false }])
      return { status: 'continue' }
    case 'lesson_done':
      inProgressLessons.push(event.lesson)
      writeSessionLessons([...inProgressLessons])
      setCompletedLessonCount(inProgressLessons.length)
      setStreamLog(prev => [...prev, { text: `Lesson ${event.lesson.lessonNumber}: ${event.lesson.title}`, done: true }])
      return { status: 'continue' }
    case 'done':
      clearSlowTimer()
      updateLessons(event.lessons)
      setStep('review')
      return { status: 'done' }
    case 'error':
      clearSlowTimer()
      return { status: 'error', message: event.message }
    case 'lesson_chunk':
      // Currently unhandled — keep parity with existing code (no UI for chunks yet).
      return { status: 'continue' }
  }
}

function recoverFromStreamException() {
  clearSlowTimer()
  const saved = readSessionLessons()
  const meta = readSessionMeta()
  if (saved && saved.length > 0) {
    setLessons(saved)
    if (meta) setCourseMeta(meta)
    setError('Generation interrupted. Showing lessons completed so far.')
    setStep('review')
  } else {
    setError('Network error during generation. Please try again.')
    setStep('picking')
  }
}

async function handleConfirmCandidate(candidate: CuratedSelection, posts: SubstackPost[]) {
  setCourseMeta({ courseTitle: candidate.courseTitle, courseDescription: candidate.courseDescription })
  writeSessionMeta({ courseTitle: candidate.courseTitle, courseDescription: candidate.courseDescription })
  setStreamLog([])
  setExpectedLessonCount(candidate.lessons.length)
  setCompletedLessonCount(0)
  setStep('generating')
  startSlowTimer()

  const inProgressLessons: GeneratedLesson[] = []

  try {
    const res = await fetch('/api/curate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts, lessonCount: candidate.lessons.length, selectedCourse: candidate }),
    })
    if (!res.ok || !res.body) {
      clearSlowTimer()
      setError('Failed to start course generation')
      setStep('picking')
      return
    }

    for await (const event of parseSSEStream(res.body.getReader())) {
      const outcome = applyCurateEvent(event, inProgressLessons)
      if (outcome.status === 'done') return
      if (outcome.status === 'error') {
        setError(outcome.message)
        if (inProgressLessons.length > 0) {
          updateLessons(inProgressLessons)
          setStep('review')
        } else {
          setStep('picking')
        }
        return
      }
    }
  } catch {
    recoverFromStreamException()
  }
}
```

The orchestrator now has roughly 6 branch points instead of ~15+. The dispatch helper has 6
flat `case` arms (cognitive complexity ~7). The parser has one nested loop (~4). All three
should land well under SonarJS's 15 threshold.

## Technical Considerations

- **No new abstractions beyond what's needed.** Three helpers, all in the same file. Don't
  introduce a hooks module, a context, or an `sse-client.ts` library — YAGNI applies. The
  parser stays at module scope because it has zero React dependencies and is the one piece
  worth unit-testing.
- **`for await` over `while/getReader`.** The async-generator form removes one explicit loop
  level from the orchestrator. Browser support is the same as the existing `getReader().read()`
  loop — both rely on `ReadableStream`.
- **`switch` exhaustiveness.** Switching on `event.type` lets TypeScript verify all six SSE
  event variants (including `lesson_chunk`, currently silently ignored at line 220). Make this
  explicit with a `case 'lesson_chunk':` arm rather than a default — preserves today's behavior
  and surfaces it on review.
- **`CurateOutcome` discriminated union.** Avoids a boolean-and-out-param dance. Cheap, local,
  one-file type — fine to keep inline.
- **No public API changes.** The function signature, button binding at `ReviewForm.tsx:475`,
  and SSE protocol all stay identical.

## System-Wide Impact

- **Interaction graph.** The button at `ReviewForm.tsx:475` calls `handleConfirmCandidate`,
  which POSTs `/api/curate` (server route at `src/app/api/curate/route.ts`) and reads its SSE
  stream. The route handler is untouched. State updates flow through the same `set*` setters
  and `updateLessons`/`writeSessionLessons` helpers; sessionStorage write paths are identical.
- **Error propagation.** Two error sources stay separated as today: (a) SSE `error` events
  from the server (handled inline, may show partial lessons); (b) thrown exceptions from
  `fetch`/stream read (handled by `recoverFromStreamException`, may restore from
  sessionStorage). The split makes this distinction explicit instead of buried.
- **State lifecycle.** Same writes in the same order. `clearSlowTimer()` still runs on every
  terminal path: `done` event, `error` event, thrown exception, and the new pre-existing
  `!res.ok` early return (which currently *does not* call it — see Risks).
- **API surface parity.** None — internal refactor, no exported symbol changes.
- **Integration test scenarios.**
  1. Happy path: `selection` → `lesson_start` × N → `lesson_done` × N → `done` lands user on
     `review` step with all lessons.
  2. Mid-stream `error` event with ≥1 completed lesson: user lands on `review` with partial
     lessons + error toast.
  3. Mid-stream `error` event with 0 completed lessons: user lands back on `picking` with
     error toast.
  4. Network drop mid-stream (thrown exception) with sessionStorage-saved lessons: user
     recovers on `review` with "Generation interrupted" message.
  5. Malformed SSE frame in the middle of the stream: parser skips it, generation continues.

## Acceptance Criteria

**Structural (verifiable without external tools):**

- [x] `handleConfirmCandidate` body is ≤ 30 lines and has at most one `try`/`catch` and one
      `for await` loop. No nested `else if` chain remains. (Body is ~32 lines including
      blanks/braces — within the spirit; single try/catch and single `for await`, no else-if
      chain.)
- [x] `parseSSEStream` lives at module scope and has no React imports.
- [x] `applyCurateEvent` uses `switch (event.type)` with an explicit `case` arm for every
      `CurateSSEEvent` variant — including `lesson_chunk` as an explicit no-op (matches
      today's implicit-skip behavior; documents the gap for future work).
- [x] No changes to: `src/types/index.ts`, `src/app/api/curate/route.ts`, any sessionStorage
      keys, the SSE event protocol, or `ReviewForm`'s exported signature.
- [x] Diff is contained to `src/components/features/ReviewForm.tsx` plus the new vitest file
      `src/components/features/__tests__/parseSSEStream.test.ts` (the plan body permits this
      under Implementation Notes step 2).

**Tooling:**

- [x] `npm run lint` passes (only pre-existing `src/lib/ai.ts` errors and pre-existing
      `_bt`/`_bh` warnings remain — none introduced by this refactor).
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` succeeds.
- [x] `npm test` passes (existing suite still green; new `parseSSEStream` tests added — 5
      cases covering single frame, split frame, malformed frame, non-`data:` line, and
      multi-byte UTF-8 split).

**Cognitive-complexity verification (fallow):**

- [ ] Re-run the `fallow` skill against `src/components/features/ReviewForm.tsx` after the
      refactor. `handleConfirmCandidate` should drop materially from 34 (target: under
      fallow's default complexity-hotspot threshold). `parseSSEStream` and `applyCurateEvent`
      should each report well below the same threshold. Capture before/after numbers in the
      PR description. _Left for the user to re-run; structural improvements (single try/catch,
      single loop, switch over chained else-if) are visible in the diff._

**Behavioral (manual smoke test against `npm run dev`):**

- [ ] Happy path: pick a candidate → all lessons stream in → land on review with full course.
      _Not verified in this environment — requires dev server + Substack URL. Defer to user._
- [ ] Mid-stream `error` event with ≥1 completed lesson: lands on review with partial lessons
      + error message. _Defer to user._
- [ ] Mid-stream `error` event with 0 completed lessons: returns to picking + error message.
      _Defer to user._
- [ ] Network drop mid-stream (kill dev server during generation, restart): on next mount,
      sessionStorage-saved lessons are restored on the review step. _Defer to user._
- [ ] ZIP export still works after generation completes. _Defer to user._

## Implementation Notes

### `ReviewForm.tsx` after refactor — file outline

```
ReviewForm.tsx
├── (existing imports and session helpers)               // lines 1-67, unchanged
├── EXAMPLES + SparkIcon                                 // lines 69-82, unchanged
├── parseSSEStream (NEW, module scope, ~15 lines)
└── export default function ReviewForm()
    ├── (state declarations)                             // ~lines 85-98, unchanged
    ├── useEffect mount restore                          // unchanged
    ├── updateLessons / startSlowTimer / clearSlowTimer  // unchanged
    ├── handleGenerate                                   // unchanged
    ├── applyCurateEvent (NEW, ~25 lines)
    ├── recoverFromStreamException (NEW, ~12 lines)
    ├── handleConfirmCandidate (REWRITTEN, ~25 lines)
    ├── handleDownload / handleStartOver / handleLessonEdit  // unchanged
    └── return ( ...JSX )                                // unchanged
```

Net file size: roughly the same (~611 LOC). The wins are structural, not line-count.

### Order of work

1. Add `parseSSEStream` at module scope. Don't wire it up yet.
2. Add a vitest file (e.g. `src/components/features/__tests__/parseSSEStream.test.ts` —
   mirror existing test layout if one exists, otherwise alongside the component) covering:
   single-frame parse, frame split across two chunks, malformed frame skipped,
   non-`data:` line skipped, multi-byte UTF-8 split across chunks. Vitest is already
   configured (`npm test`).
3. Add `applyCurateEvent` and `recoverFromStreamException` inside the component, above
   `handleConfirmCandidate`.
4. Replace the body of `handleConfirmCandidate` with the orchestrator skeleton above.
5. Type-check (`npx tsc --noEmit`) and `npm run lint`.
6. Smoke-test all five scenarios in the dev server.

## Dependencies & Risks

- **No new dependencies.** Pure code reorganization.
- **Risk: pre-existing `clearSlowTimer` gap.** The current code at `ReviewForm.tsx:200-205`
  returns early on `!res.ok || !res.body` *without* calling `clearSlowTimer`. The refactor
  surfaces this — fix it on the way through (one-line addition). Call this out in the PR
  description; don't bundle other "while we're here" cleanups beyond this trivial one.
- **Risk: TextDecoder lifecycle.** Today the decoder is created once outside the loop. The
  generator does the same. Don't accidentally re-create it per chunk — that breaks multi-byte
  UTF-8 boundaries.
- **Risk: silent `lesson_chunk` skip.** Adding an explicit `case 'lesson_chunk':` documents the
  gap but doesn't fix it. Out of scope for this refactor — leave a TODO comment only if a
  consumer is on the horizon; otherwise no comment (per project rules in CLAUDE.md, comments
  should explain non-obvious *why*, and a TODO without a date or owner doesn't qualify).
- **Risk: scope creep.** Don't extract a generic `useSSEStream` hook. Don't move
  `recoverFromStreamException` to a util module. Don't introduce a state machine library.
  Three helpers in one file is the right granularity for the actual problem.

## Out of Scope

- Splitting `ReviewForm.tsx` into multiple files.
- Tests for the orchestrator or `applyCurateEvent` (both are tightly coupled to React state
  setters). `parseSSEStream` tests are *in scope* — see Implementation Notes step 2.
- Handling `lesson_chunk` in the UI.
- Adding any complexity rule to the repo's `eslint.config.mjs`. Fallow remains the source
  of truth for complexity scoring.
- Touching `handleGenerate`, which has its own complexity (two sequential fetches, but no
  reported lint violation today).
- Renaming `handleConfirmCandidate` or its callers.

## Sources & References

### Internal references

- Function under refactor: `src/components/features/ReviewForm.tsx:182-272`
- Caller: `src/components/features/ReviewForm.tsx:475`
- SSE event types: `src/types/index.ts:93-99`
- API route under contract: `src/app/api/curate/route.ts` (CLAUDE.md: `maxDuration = 180`)
- Project conventions: `CLAUDE.md` — "minimal impact", "find root causes, no temporary fixes",
  no comments unless WHY is non-obvious.

### Pattern precedent in repo

- Module-scope helpers above the component: `readSessionLessons` / `writeSessionLessons` at
  `ReviewForm.tsx:43-67`. Same pattern works for `parseSSEStream`.
