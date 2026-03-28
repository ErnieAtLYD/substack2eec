---
title: Fix stale closure data loss in handleLessonEdit textarea onChange handlers
date: 2026-03-28
tags: [react, stale-closure, useCallback, functional-updater, data-loss, state-management]
problem_type: logic_error
severity: high
component: src/components/features/ReviewForm.tsx
symptom: Rapid typing across two textareas before React re-renders causes the second onChange to silently overwrite the first edit, resulting in data loss
root_cause: handleLessonEdit captured the lessons array from render-time closure; concurrent onChange events both read the same stale snapshot and the second write discarded the first update
fix_commit: c3b2cc0
related_todos: ["012"]
---

# Stale Closure Data Loss: Use Functional State Updaters in Event Handlers

## Problem Statement

`handleLessonEdit` in `ReviewForm.tsx` was a plain function defined inside the component body. Each render captured a snapshot of the `lessons` array from that render's closure. When a user typed quickly across two lesson editor textareas — triggering two `onChange` events before React had time to re-render and produce a fresh closure — the second call to `handleLessonEdit` would read the same stale pre-first-edit `lessons` array. The second call would compute its `updated` array from that stale snapshot and overwrite state, silently discarding the first edit.

This class of bug is particularly subtle because:
- It only manifests under rapid input (two state updates within a single render cycle).
- There is no error or warning; the UI simply reverts one of the edits.
- The function looks completely correct in isolation — the stale read is invisible at the call site.
- Session persistence (`writeSessionLessons`) also writes the stale-derived value, so the bad state survives a page refresh.

---

## Before (broken code)

```typescript
// Captured `lessons` from the render-time closure.
// If two onChange events fire before the next render, both calls
// see the same snapshot of `lessons` — the second overwrites the first edit.
function handleLessonEdit(index: number, value: string) {
  const updated = lessons.map((l, i) =>         // ← stale closure read
    i === index ? { ...l, markdownBody: value } : l
  )
  writeSessionLessons(updated)
  setLessons(updated)
}
```

**Why it fails:** `lessons` is resolved at the moment the function was created (i.e., at the last render). Between two rapid `onChange` events, React has not re-rendered, so both invocations capture the same `lessons` reference. The second call's `updated` is derived from the original array, not from the array that the first call produced.

---

## After (fixed code)

```typescript
// src/components/features/ReviewForm.tsx — lines 271-279
const handleLessonEdit = useCallback((index: number, value: string) => {
  setLessons(prev => {
    const updated = prev.map((l, i) =>           // ← always the latest state
      i === index ? { ...l, markdownBody: value } : l
    )
    writeSessionLessons(updated)
    return updated
  })
}, [])
```

**Why it works:** The functional updater form of `setLessons` receives `prev`, which React guarantees is the most recently committed (or most recently enqueued) state value — not whatever `lessons` happened to be at render time. No matter how many calls are batched before a re-render, each call's `prev` correctly reflects all prior enqueued updates. `useCallback` with an empty dependency array ensures the function never needs to close over `lessons` at all.

---

## Why This Works

React's `setState` functional updater (`setState(prev => newValue)`) does not read from the closure. Instead, React internally queues updater functions and applies them in sequence, threading the output of each updater as the input (`prev`) of the next:

1. First `onChange` fires → React enqueues `prev_0 => updated_0`
2. Second `onChange` fires (same render cycle) → React enqueues `prev_1 => updated_1`
3. React flushes the queue: `updated_0` is computed from the original state, then `updated_1` is computed from `updated_0` — not from the original state again.

The two edits are composed correctly because each updater operates on the output of the previous one, forming a reliable update chain regardless of render timing.

---

## Key Insight

**Whenever a state update depends on the current value of that same state, always use the functional updater form (`setState(prev => ...)`) rather than reading the state variable directly from the closure.**

The plain `setState(newValue)` pattern is safe only when `newValue` is entirely independent of the current state. The moment you write `setState(derive(stateVar))` inside an event handler, you have introduced a potential stale-closure race condition.

---

## Watch Out For

**React Strict Mode double-invocation.** In development with Strict Mode enabled, React intentionally calls functional updaters twice (with the same `prev`) to surface impure updaters. If your updater has side effects — as this one does (`writeSessionLessons(updated)`) — those side effects will fire twice in development. This is harmless in production but can cause confusing double-writes to `sessionStorage` during local development. The correct fix is to move the side effect outside the updater into a `useEffect` that watches `lessons`, but the current implementation accepts this trade-off because the side effect is idempotent (`sessionStorage.setItem` with the same value is a no-op in effect).

**When NOT to use `useCallback`.** `useCallback` is only beneficial when the stable reference matters: passing the callback to a `React.memo`-wrapped child, or listing it in a `useEffect` / `useMemo` dependency array. When the handler is consumed only via inline arrow functions in `.map()` (e.g., `onChange={e => handleLessonEdit(i, e.target.value)}`), the outer `useCallback` provides no performance benefit — the inline arrow still recreates on every render regardless. See todo `032` for a follow-up to remove the vacuous `useCallback` wrapper.

**Forgetting to return from the updater.** The updater must return the new state value. An accidental implicit `return undefined` will silently set state to `undefined`, clearing the entire array. Always verify the return path.

---

## How to Spot This Pattern

- A handler closes over a state variable (e.g., `lessons`, `items`, `rows`) and reads it directly inside the function body rather than using a functional updater
- The handler is passed as a prop to multiple sibling components rendered via `.map()` — any of which could fire in the same render cycle
- The handler calls `.map()`, `.filter()`, or spread on the closed-over state variable, then calls `setState` with the result
- `setState` is called with a plain derived value (`setState(newArray)`) rather than a functional updater (`setState(prev => ...)`)
- There is a write-through side effect (`sessionStorage`, a ref, an external store) synchronised inside the same handler — a stale write will corrupt persisted state as well as React state

---

## Prevention Rules

1. **Always use functional updaters when deriving next state from current state.**
   ```typescript
   // ✓ Correct
   setState(prev => prev.map((item, i) => i === index ? { ...item, value } : item))

   // ✗ Wrong
   setState(items.map((item, i) => i === index ? { ...item, value } : item))
   ```

2. **Never read state directly inside a handler that also writes that state.** Referencing a state variable and then calling its setter in the same handler is a signal to switch to a functional updater.

3. **Move write-through side effects to `useEffect`.** Keep `sessionStorage.setItem`, ref assignments, and external store writes out of event handlers:
   ```typescript
   useEffect(() => {
     sessionStorage.setItem(SESSION_KEY, JSON.stringify(lessons))
   }, [lessons])
   ```

4. **Treat handlers passed to mapped children as inherently concurrent.** Any time you `.map()` over data to produce a list of components sharing the same callback, assume all of them can fire before the next render.

---

## Test Scenarios

**Scenario 1 — Rapid sequential edits to two different indices**

Simulate two `onChange` calls synchronously before React re-renders. Call `handleLessonEdit(0, 'edit A')` immediately followed by `handleLessonEdit(1, 'edit B')`. Assert that after React flushes: `lessons[0].markdownBody === 'edit A'` AND `lessons[1].markdownBody === 'edit B'`. With the stale-closure version, the second call overwrites index 0's edit because it saw the original `lessons` array.

**Scenario 2 — sessionStorage consistency after concurrent edits**

After the same two rapid calls, read `JSON.parse(sessionStorage.getItem(SESSION_KEY))` and assert both edits are present. The write-through anti-pattern causes sessionStorage to reflect only the second call's snapshot, silently discarding the first edit.

**Scenario 3 — High-frequency input on one field does not corrupt siblings**

Simulate 20 rapid keystrokes on textarea at index 2. Assert that all other indices remain unchanged throughout. This catches cases where a stale closure holds an old copy of the full array and re-writes siblings back to their previous values.

---

## Related ESLint Rules

- **`react-hooks/exhaustive-deps`** — Warns when a `useCallback` or `useEffect` closes over a state variable not listed in the dependency array. If `lessons` is missing from the deps of a `useCallback`-wrapped handler, this rule fires, directly flagging the stale-closure surface.
- **`react-hooks/rules-of-hooks`** — Ensures hooks are not called conditionally or inside loops; violations create handler identity instability that compounds stale-closure bugs.

No built-in ESLint rule directly bans `setState(derive(stateVar))` in favour of functional updaters. A `no-restricted-syntax` entry can be configured to catch the pattern, or enforce it via code review checklist.

---

## Related Documentation

- [`docs/solutions/runtime-errors/streamlog-parsing-source-error.md`](../runtime-errors/streamlog-parsing-source-error.md) — Complementary doc: deriving structured state from display strings (`streamLog.filter(...)`) instead of tracking state directly. Both cover React state management pitfalls in `ReviewForm.tsx` during SSE streaming.
- [`docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md`](../security-issues/user-input-ai-param-allowlist-and-prompt-injection.md) — Context on `lessonCount` state in the same component; the `handleLessonEdit` stale closure was introduced alongside this state.

## Related Todos

- `todos/012-complete-p1-stale-closure-handleLessonEdit-data-loss.md` — The original bug report and fix
- `todos/032-pending-p3-usecallback-on-handlelessonedit-vacuous.md` — Follow-up: the `useCallback` wrapper is vacuous since no memoized child consumes the callback directly
- `todos/018-complete-p3-examples-array-inside-render.md` — Related render-cycle allocation issue in the same component

## Work Log

- 2026-03-28: Bug discovered in PR #3 code review (six parallel review agents)
- 2026-03-28: Fix applied in commit `c3b2cc0` — `handleLessonEdit` converted to functional `setLessons(prev => ...)` updater
- 2026-03-28: Documentation created via `/compound`
