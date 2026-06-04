---
status: complete
priority: p3
issue_id: "186"
tags: [code-review, security, pre-existing]
dependencies: []
---

# No cap on SSE frame count / accumulated lesson state (pre-existing)

The #149 cap bounds a single unterminated frame, but a malicious or broken same-origin response emitting unbounded *valid* frames can still grow client state without limit.

## Problem Statement

`applyCurateEvent` accumulates into `inProgressLessons` (→ React state → sessionStorage) with no cap on frame count or total accumulated size. Millions of tiny valid `lesson_chunk`/`lesson_start`/`lesson_done` frames would each drain the parse buffer (never tripping `MAX_SSE_BUFFER_CHARS`) while pinning a core in `JSON.parse` and growing memory unbounded. Pre-existing condition, **not introduced by PR #32**; the realistic threat actor is only a compromised same-origin server — the same trust model the PR already assumes.

## Findings

- security-sentinel Q3 (Low): the new buffer cap is correctly scoped to the unterminated remainder; frame-count accumulation is the remaining unbounded dimension.
- Also noted (Info, awareness only): parsed frames are cast `as CurateSSEEvent` with no runtime shape validation — malformed-but-valid-JSON flows into `applyCurateEvent` and export. Acceptable at a same-origin boundary.
- Legitimate ceiling is small: max 10 lessons, each ≤ ~30 KB frame (bounded by `max_tokens: 2048` in `src/lib/ai.ts:430`), so a generous cap would never affect real traffic.

## Proposed Solutions

### Option 1: MAX_SSE_FRAMES guard in parseSSEStream

**Approach:** Add `MAX_SSE_FRAMES` (e.g. 10_000) to `src/lib/limits.ts`; count yielded frames in parseSSEStream and throw past the cap, reusing the #149 throw → cancel → recover path.

**Pros:** Same shape as the existing cap; one-line check; reuses tested recovery path
**Cons:** Another constant to justify
**Effort:** 1 hour with tests
**Risk:** Low

---

### Option 2: Cap accumulated lesson bytes instead

**Approach:** Bound total `inProgressLessons` size in `applyCurateEvent` (e.g. `MAX_LESSONS * MAX_BODY_CHARS`-ish).

**Pros:** Bounds the actual resource (memory/sessionStorage), not a proxy
**Cons:** Touches event-application logic; sessionStorage quota already provides a rough backstop
**Effort:** 2 hours
**Risk:** Low

---

### Option 3: Accept the risk

**Approach:** Document that the same-origin trust model makes this attacker-unreachable in practice.

**Pros:** Zero code
**Cons:** A broken (not malicious) server bug could still wedge a tab
**Effort:** 0
**Risk:** Low

## Recommended Action

Option 1 implemented (user-confirmed): `MAX_SSE_FRAMES` guard in parseSSEStream.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx` — parseSSEStream / applyCurateEvent
- `src/lib/limits.ts` — new constant (Option 1)

## Resources

- **PR:** #32 (flagged during its review; explicitly out of scope there)
- **Reviewer:** security-sentinel (Q3, Low)
- **Similar patterns:** todos/149-complete-p2-parsessestream-unbounded-buffer.md

## Acceptance Criteria

- [ ] A stream emitting frames past the chosen bound terminates via the existing recovery path
- [ ] Legitimate max-size courses (10 lessons) are nowhere near the cap
- [ ] Tests pin both the trip and no-trip cases

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #32 — security-sentinel)

**Learnings:**
- Bounding one dimension (frame size) highlights the unbounded neighbor (frame count); enumerate all growth dimensions when adding caps.

### 2026-06-04 - Resolution

**By:** Claude Code

**Actions:**
- `src/lib/limits.ts`: `MAX_SSE_FRAMES = 100_000 as const` with rationale (legitimate ceiling ≈ 20k lesson_chunk events for 10 lessons; ~5× margin)
- `parseSSEStream`: optional `{ maxFrames = MAX_SSE_FRAMES }` param; counts yielded frames, throws past the cap into the existing #149 throw → generator-finally-cancel → recover path; malformed (skipped) frames don't count
- Tests: trip case (6 frames, `maxFrames: 5` override → rejects /frame count/) and at-cap boundary (5 frames → all yielded) — small override keeps fixtures tiny per the #183 lesson; runtime-shape validation of parsed frames noted as accepted same-origin risk (unchanged)
