---
status: pending
priority: p3
issue_id: "183"
tags: [code-review, quality, testing]
dependencies: []
---

# Tighten parseSSEStream cap tests: decouple from cap size + add boundary case

The two new #149 tests are correct, but the throughput test's cost scales linearly with `MAX_SSE_BUFFER_CHARS`, and there is no boundary test pinning the `>` (vs `>=`) comparison direction.

## Problem Statement

`parseSSEStream.test.ts:95-104` builds `ceil(2 * MAX_SSE_BUFFER_CHARS / 48)` ≈ **41,600 tiny frames** (~2 MB of fixtures, ~41k `JSON.parse` calls) per run. If the cap is ever raised (say to 50 MB), this test silently becomes a multi-second, ~2M-frame, 100 MB-allocation monster. Separately, no test asserts that a frame at exactly `MAX_SSE_BUFFER_CHARS` chars does **not** throw — the off-by-one direction of `buffer.length > MAX_SSE_BUFFER_CHARS` is unpinned.

## Findings

- The throughput test's invariant ("cumulative > cap doesn't throw, because each terminated frame drains the buffer") is proven the moment cumulative size crosses the cap once — a handful of *large* terminated frames proves the same thing with ~10 frames instead of ~41k, and runtime stays flat if the cap grows. (performance-oracle finding 5; code-simplicity-reviewer concurs)
- Boundary gap: a single unterminated chunk of exactly `MAX_SSE_BUFFER_CHARS` chars should not throw; `+1` should. Currently only `+1` is tested. (kieran-typescript-reviewer finding 5)
- Do NOT weaken the invariant the second test pins — it guards against someone "simplifying" the check to cumulative throughput, which would break long courses. (institutional learning, todos/149)

## Proposed Solutions

### Option 1: Few-large-frames rewrite + boundary test

**Approach:**
- Throughput test: ~5 frames of `data: {...large padded payload...}\n\n` whose sum exceeds the cap; assert all yield, no throw.
- New boundary test: unterminated chunk of exactly `MAX_SSE_BUFFER_CHARS` chars → no throw (then complete the frame and assert it parses, or just assert no rejection).

**Pros:** Same invariants, flat runtime regardless of cap value, pins the comparison direction
**Cons:** None
**Effort:** 30 min
**Risk:** Low

---

### Option 2: Cap the loop count only

**Approach:** `Math.min(frameCount, N)` once cumulative exceeds the cap.

**Pros:** Smallest diff
**Cons:** Still misses the boundary test; less clear intent
**Effort:** 10 min
**Risk:** Low

## Recommended Action

**To be filled during triage.**

## Technical Details

**Affected files:**
- `src/components/features/__tests__/parseSSEStream.test.ts:88-104`

## Resources

- **PR:** #32
- **Related issue:** #149
- **Reviewers:** performance-oracle (finding 5), kieran-typescript-reviewer (finding 5)

## Acceptance Criteria

- [ ] Throughput test cost no longer scales with `MAX_SSE_BUFFER_CHARS`
- [ ] Boundary test pins `>` vs `>=` at exactly the cap
- [ ] Remainder-not-cumulative invariant still explicitly pinned
- [ ] Full suite green

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #32)

**Learnings:**
- Test fixtures derived as multiples of a tunable constant silently inherit that constant's future growth.
