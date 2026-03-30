---
status: done
priority: p3
issue_id: "042"
tags: [code-review, performance, quality]
dependencies: []
---

# `sanitizeForPrompt` Should Slice Before Replace to Bound Regex Scan

## Problem Statement

`sanitizeForPrompt` currently runs `.replace(/[\n\r]/g, ' ')` on the full input string, then `.slice(0, 300)`. For adversarially long inputs (e.g., a crafted `title` field with 10,000 characters), the regex scans the entire string before the result is discarded past position 300. Reversing the order bounds the regex scan to at most 300 characters regardless of input length.

## Findings

**Location:** `src/lib/ai.ts:73-75`

```typescript
function sanitizeForPrompt(s: string): string {
  return s.replace(/[\n\r]/g, ' ').slice(0, 300)  // scans full string, then discards
}
```

Correct order:
```typescript
return s.slice(0, 300).replace(/[\n\r\t]/g, ' ')  // scan bounded to 300 chars
```

Raised by: performance-oracle.

## Proposed Solutions

### Option A: Swap order — slice first, then replace (Recommended)
```typescript
function sanitizeForPrompt(s: string): string {
  return s.slice(0, MAX_PROMPT_FIELD_LEN).replace(/[\n\r\t]/g, ' ')
}
```
- **Pros:** Bounds regex work to max 300 chars; trivial to reason about; semantically identical for non-adversarial inputs
- **Effort:** Trivial (reorder two chained calls)
- **Risk:** None

## Recommended Action

Option A. Negligible gain at normal input sizes but defensively correct and costs nothing.

## Technical Details

**Affected file:** `src/lib/ai.ts:73-75`

## Acceptance Criteria

- [ ] `sanitizeForPrompt` calls `.slice(0, MAX_PROMPT_FIELD_LEN)` before `.replace(...)`
- [ ] `npx tsc --noEmit` passes

## Work Log

- 2026-03-29: Identified during multi-agent review of PR #4 (performance-oracle)
