---
status: done
priority: p3
issue_id: "043"
tags: [code-review, quality, documentation]
dependencies: []
---

# Add Doc Comments to `xmlEscape` and `sanitizeForPrompt` Explaining Context Boundaries

## Problem Statement

`xmlEscape` and `sanitizeForPrompt` are security-critical helpers with non-obvious usage constraints:

- `xmlEscape` is safe for XML **element content** only, not XML attribute values (does not escape `"` or `'`). A future caller using it inside `<tag attr="${xmlEscape(s)}">` would introduce an attribute injection vulnerability with no warning.
- `sanitizeForPrompt` is designed for **plain-text prompt context** only, not XML blocks. Future callers embedding sanitized-but-not-XML-escaped values into an XML prompt would reopen the injection chain.

Neither function has any comment today. Without comments, the boundary between the two is invisible to future contributors.

## Findings

**Location:** `src/lib/ai.ts:14-16, 73-75`

```typescript
function xmlEscape(s: string): string { ... }  // no doc comment

function sanitizeForPrompt(s: string): string { ... }  // no doc comment
```

Raised by: kieran-typescript-reviewer, security-sentinel.

## Proposed Solutions

### Option A: Add one-line doc comments (Recommended)
```typescript
// Escapes XML element content. NOT safe for XML attribute values (does not escape quotes).
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Sanitizes user-controlled strings for plain-text prompt context: collapses whitespace,
// caps length. Apply xmlEscape separately when embedding in XML blocks.
function sanitizeForPrompt(s: string): string {
  return s.slice(0, MAX_PROMPT_FIELD_LEN).replace(/[\n\r\t]/g, ' ')
}
```
- **Pros:** Zero behavioral change; prevents future misuse; explains the two-function boundary
- **Effort:** Trivial
- **Risk:** None

## Recommended Action

Option A. Add both comments in the same commit as the other p3 cleanup items (todos 040, 042).

## Technical Details

**Affected file:** `src/lib/ai.ts:14-16, 73-75`

## Acceptance Criteria

- [ ] `xmlEscape` has a comment noting it is for element content only, not attribute values
- [ ] `sanitizeForPrompt` has a comment explaining its plain-text context and the need for `xmlEscape` in XML contexts

## Work Log

- 2026-03-29: Identified during multi-agent review of PR #4 (kieran-typescript-reviewer, security-sentinel)
