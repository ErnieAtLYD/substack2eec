---
status: complete
priority: p3
issue_id: "187"
tags: [code-review, security, sse]
dependencies: []
---

# MAX_SSE_FRAMES counts only parsed frames — malformed frames bypass both caps

Three reviewers (TypeScript, security, performance) independently converged: `frameCount` increments only after a *successful* `JSON.parse`, so an endless stream of `data: {malformed\n\n` frames trips neither cap.

## Problem Statement

In `parseSSEStream` (`ReviewForm.tsx`), each terminated-but-malformed frame drains the buffer (never trips `MAX_SSE_BUFFER_CHARS`) and hits the parse `catch` without incrementing `frameCount` (never trips `MAX_SSE_FRAMES`). The loop spins indefinitely. This slightly undercuts #186's claim of bounding "endless frames" — only *valid* ones are bounded. Severity is Low: the only source is the same-origin `/api/curate` route, so exploiting it requires server compromise/MITM; the malformed-skip behavior also predates this PR.

## Findings

- security-sentinel (Finding 5, Low): confirmed mechanics; pre-existing trust-model gap, not worsened by PR #33, but the new cap doesn't extend to it
- kieran-typescript-reviewer: same, suggests counting every `data: ` frame examined
- performance-oracle: only backstop today is `maxDuration`/connection lifetime

## Proposed Solutions

### Option 1: Count every `data: ` frame (recommended by all three)

**Approach:** Move the increment before the `try`, so the cap bounds frames *processed*, not frames *yielded*:

```ts
for (const part of parts) {
  if (!part.startsWith('data: ')) continue
  if (frameCount >= maxFrames) throw new Error('SSE frame count exceeded cap — upstream emitting unbounded events')
  frameCount++
  try {
    yield JSON.parse(part.slice(6)) as CurateSSEEvent
  } catch { /* malformed — skip */ }
}
```
Update the adjacent comment (currently says malformed frames don't count) and the limits.ts rationale if needed. Add a malformed-flood trip test with a small `maxFrames` override.

**Pros:** True total-frame bound; 3-line diff; no behavior change for legitimate streams
**Cons:** None meaningful
**Effort:** 15 min
**Risk:** Low

### Option 2: Accept and document

**Approach:** Note the residual gap in the limits.ts comment; rely on the same-origin trust model + connection lifetime.

**Pros:** Zero code
**Cons:** Cap claim stays slightly overstated
**Effort:** 5 min
**Risk:** Low

## Recommended Action

Option 1 implemented (count every `data:` frame before parsing).

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx` — parseSSEStream frame loop
- `src/components/features/__tests__/parseSSEStream.test.ts` — one new trip test

## Resources

- **PR:** #33
- **Related:** todos/186-complete-p3-no-cap-on-sse-frame-count-accumulation.md
- **Reviewers:** security-sentinel (F5), kieran-typescript-reviewer, performance-oracle (action 2)

## Acceptance Criteria

- [ ] A terminated-malformed-frame flood trips the frame cap
- [ ] Legitimate streams unaffected; existing tests green
- [ ] Comments updated to match the new counting semantics

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #33 — 3-agent convergent finding)

### 2026-06-04 - Resolution

**By:** Claude Code

**Actions:**
- `parseSSEStream`: `frameCount++` moved before the `try`, so every `data:` frame counts toward `maxFrames` regardless of parse outcome; comment updated (frames *processed*, not *yielded*)
- `limits.ts`: `MAX_SSE_FRAMES` rationale updated — bounds valid *and* malformed frames
- New test: 6 terminated-but-malformed frames with `maxFrames: 5` → rejects /frame count/ (the flood that previously bypassed both caps)
- 155/155 green; tsc clean
