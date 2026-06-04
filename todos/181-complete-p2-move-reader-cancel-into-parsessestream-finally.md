---
status: complete
priority: p2
issue_id: "181"
tags: [code-review, quality, architecture, sse]
dependencies: []
---

# Move reader.cancel() into parseSSEStream's own finally block

The PR #32 reader-cancellation fix (#153) is correct but implemented at the wrong altitude: the React component acquires and cancels the reader while the generator reads it. Generator-owned cleanup is simpler and closes a remaining gap.

## Problem Statement

`ReviewForm.tsx:298-322` hoists `res.body.getReader()` into the component, wraps the `for await` in `try/finally`, and cancels there. This splits reader ownership across two layers and forced 5 lines of explanatory comments. Meanwhile the test helper `collect()` drives the same generator and gets **no** cancellation at all — the test-side reader leak from #153 is still open.

## Findings

- A `for await...of` loop exiting via `return`, `break`, or `throw` invokes the async iterator's `.return()`, which runs `finally` blocks **inside** the generator body — so a generator-internal `finally { reader.cancel() }` covers all exit paths (done-return at `ReviewForm.tsx:305`, error-return at `:315`, overflow throw at `:99`, normal completion).
- Both consumers — production (`ReviewForm.tsx:303`) and the test `collect()` helper (`parseSSEStream.test.ts:24`) — use `for await`, so both get cancellation for free with the generator-owned version.
- Only one production caller exists; no caller wants the reader to outlive the generator. No fragility risk.
- Net effect: deletes ~8 lines at the call site (hoist, inner try, finally, two comment blocks) for ~3 lines in the generator. Smaller diff vs main than the current PR.
- (Simplicity reviewer finding #1, subsumes #2; performance reviewer suggests an accompanying one-line comment near `ReviewForm.tsx:94` noting the split-per-chunk loop is O(n²) on an unterminated stream and only kept safe by the 1MB cap.)

## Proposed Solutions

### Option 1: Generator-owned finally (recommended by simplicity reviewer)

**Approach:**
```ts
export async function* parseSSEStream(reader) {
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) { /* ... unchanged ... */ }
  } finally {
    await reader.cancel().catch(() => {})
  }
}
```
Revert the call site to its pre-PR shape (`for await (const event of parseSSEStream(res.body.getReader()))`).

**Pros:**
- Reader acquired, consumed, released in one place — the owner
- Fixes the test-side reader leak for free
- Removes both call-site comment blocks and the try/finally
- Smaller overall diff vs main

**Cons:**
- Relies on the (standard, spec-guaranteed) `.return()` → generator-finally semantics, which a reader must know

**Effort:** 30 min (move + rerun 148-test suite)

**Risk:** Low

---

### Option 2: Keep call-site cancellation as shipped

**Approach:** No change; current code is correct.

**Pros:**
- Already merged-ready, explicit at the call site

**Cons:**
- Split ownership, extra bookkeeping/comments, test-side reader still uncancelled

**Effort:** 0

**Risk:** Low

## Recommended Action

Option 1 (generator-owned finally) — implemented. See resolution in Work Log.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:85-111` — parseSSEStream generator
- `src/components/features/ReviewForm.tsx:298-322` — call site (revert)
- `src/components/features/__tests__/parseSSEStream.test.ts` — no changes needed; benefits automatically

## Resources

- **PR:** #32
- **Related issues:** #149, #153
- **Pattern:** `todos/153-complete-p2-sse-reader-not-cancelled-on-early-exit.md` (Option A precedent)

## Acceptance Criteria

- [ ] `reader.cancel().catch(() => {})` lives in parseSSEStream's `finally`
- [ ] Call site reverted to inline `parseSSEStream(res.body.getReader())` without try/finally
- [ ] All exit paths still cancel (done, error-return, overflow throw) — existing tests pass
- [ ] Optional: one-line O(n²) note near the `buffer.split('\n\n')` line
- [ ] Full suite green; `tsc --noEmit` clean

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #32 — code-simplicity-reviewer + performance-oracle)

**Actions:**
- Verified `for await` exit semantics trigger generator finally blocks
- Confirmed single production caller; test helper also benefits

**Learnings:**
- Call-site resource management of a generator-consumed reader duplicates what the generator's own finally can do, and misses secondary consumers (tests).

### 2026-06-04 - Resolution (Option 1 implemented)

**By:** Claude Code

**Actions:**
- Wrapped parseSSEStream's `while (true)` loop in `try`, added `finally { await reader.cancel().catch(() => {}) }` — covers done-return, consumer break/return (via iterator `.return()`), and the overflow throw
- Reverted the call site in `handleConfirmCandidate` to its pre-PR inline shape (`parseSSEStream(res.body.getReader())`, no hoist, no try/finally) — net −10 lines at the call site
- Added the O(n²)-on-unterminated-stream note next to `buffer.split('\n\n')` per performance-oracle
- Added test `cancels the underlying stream when the consumer exits early (#153)` — underlying-source `cancel()` spy + `break` out of `for await`; pins the iterator-`.return()` → generator-finally → `reader.cancel()` chain. Test `collect()` helper now also gets cancellation for free.

**Verification:**
- 149/149 tests green (148 prior + 1 new); `tsc --noEmit` clean; lint errors are pre-existing in `src/lib/ai.ts` (untouched)

**Learnings:**
- `for await` exit via `break`/`return`/`throw` is spec-guaranteed to call the iterator's `.return()`, resuming the generator at its `finally` — generator-owned cleanup covers every consumer without call-site bookkeeping.
