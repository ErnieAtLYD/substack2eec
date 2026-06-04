---
status: pending
priority: p3
issue_id: "185"
tags: [code-review, quality, observability]
dependencies: []
---

# Bare catch {} discards the SSE overflow/stream error reason — log it

The #149 overflow throw carries a specific message ("SSE buffer exceeded cap without a frame terminator — upstream response malformed"), but the outer `catch {}` discards it; the user and console only ever see the generic recovery message.

## Problem Statement

`ReviewForm.tsx:323` (`} catch { recoverFromStreamException() }`) swallows the error object entirely. When the buffer cap trips in production, there is no way to distinguish "malformed upstream response" from a plain network drop — both surface as "Generation interrupted / Network error during generation". Diagnosing a real CDN/proxy issue would be guesswork.

## Findings

- kieran-typescript-reviewer finding 3: the throw-vs-skip asymmetry in parseSSEStream is correct (frame-level errors skip, stream-level faults throw), and the UX degradation path is graceful — the only loss is diagnosability.
- Related minor note (finding 4): `reader.cancel().catch(() => {})` swallows *all* rejections, not just the benign "already released" one its comment names; acceptable for cleanup, but a named noop or debug log would aid diagnosing stuck connections.

## Proposed Solutions

### Option 1: Capture and console.error the exception

**Approach:** `catch (e) { console.error('curate stream failed:', e); recoverFromStreamException() }`

**Pros:** One line; preserves the specific overflow reason in devtools/error reporting
**Cons:** None
**Effort:** 5 min
**Risk:** Low

---

### Option 2: Thread the reason into the user-facing message

**Approach:** Pass `e` into `recoverFromStreamException(e)` and append a short reason when it's the overflow error.

**Pros:** User-visible distinction between malformed upstream and network drop
**Cons:** More surface; message wording needs care
**Effort:** 30 min
**Risk:** Low

## Recommended Action

**To be filled during triage.**

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:323` — outer catch
- `src/components/features/ReviewForm.tsx:321` — optional named noop on cancel

## Resources

- **PR:** #32
- **Reviewer:** kieran-typescript-reviewer (findings 3, 4)

## Acceptance Criteria

- [ ] Stream exceptions are observable (console or error state) with their original message
- [ ] Recovery UX unchanged

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #32)

**Learnings:**
- A bare `catch {}` next to a deliberately-thrown diagnostic error cancels out the value of the diagnostic.
