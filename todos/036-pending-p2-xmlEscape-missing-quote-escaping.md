---
status: pending
priority: p2
issue_id: "036"
tags: [code-review, security, xml, prompt-injection]
dependencies: []
---

# `xmlEscape` Does Not Escape `"` or `'` — Latent Attribute Injection

## Problem Statement

`xmlEscape` in `src/lib/ai.ts` escapes `&`, `<`, and `>` but omits `"` (`&quot;`) and `'` (`&#39;`). All current call sites embed values into XML element content (e.g., `<title>...</title>`), where quote characters are not structurally significant. However, if any future call site places an escaped value inside an XML attribute (e.g., `<lesson focus="${xmlEscape(focus)}">`), the missing quote escaping creates an immediate attribute injection vector.

Additionally, the function carries no comment explaining this limitation, so future callers have no signal to prompt them to check.

## Findings

**Location:** `src/lib/ai.ts:14-16`

```typescript
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // missing: .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
```

Raised by: security-sentinel, kieran-typescript-reviewer.

## Proposed Solutions

### Option A: Add `"` and `'` escaping unconditionally (Recommended)
```typescript
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```
- **Pros:** Complete XML escaping per spec; safe for both element content and attribute values; zero risk of regression at existing call sites
- **Effort:** Trivial
- **Risk:** None

### Option B: Add a doc comment explaining the limitation
```typescript
// Escapes XML element content only. Not safe for XML attribute values (does not escape quotes).
function xmlEscape(s: string): string { ... }
```
- **Pros:** No behavioral change; documents intent
- **Cons:** Does not close the gap; future callers can still misuse it

## Recommended Action

Option A — add the two extra replacements. Two extra `.replace()` calls on short strings at negligible cost, makes the function correct by the XML spec, and eliminates the entire attribute-injection risk class.

## Technical Details

**Affected file:** `src/lib/ai.ts:14-16`

## Acceptance Criteria

- [ ] `xmlEscape` replaces `"` with `&quot;` and `'` with `&#39;`
- [ ] All existing call sites continue to work (element content is semantically identical with extra escaping)
- [ ] `npx tsc --noEmit` passes

## Work Log

- 2026-03-29: Identified during multi-agent review of PR #4 (security-sentinel, kieran-typescript-reviewer)
