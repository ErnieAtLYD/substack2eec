---
status: pending
priority: p3
issue_id: "054"
tags: [code-review, documentation]
dependencies: []
---

# `xmlEscape` Comment Says "Does Not Escape Quotes" — Now Incorrect After Fix

## Problem Statement

The comment on `xmlEscape` in `src/lib/ai.ts` was updated when quote escaping was added (todo 036), but the comment still says "NOT safe for XML attribute values (does not escape quotes)". The function now *does* escape both `"` and `'`, making the second sentence of the comment wrong.

## Findings

**Location:** `src/lib/ai.ts:16-17`

```typescript
// Escapes XML element content. NOT safe for XML attribute values (does not escape quotes).
// If embedding in an attribute value context, also escape " and '.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')   // ← quote escaping was added in todo 036
    .replace(/'/g, '&#39;')    // ← and this
}
```

The comment contradicts the implementation.

## Proposed Solution

```typescript
// Escapes XML element content and attribute values (ampersand, angle brackets, double-quote, single-quote).
function xmlEscape(s: string): string {
```

## Technical Details

**Affected file:** `src/lib/ai.ts:16-17`

## Acceptance Criteria

- [ ] Comment accurately describes what `xmlEscape` escapes

## Work Log

- 2026-03-29: Found during TypeScript review of batch fixes (round 2)
