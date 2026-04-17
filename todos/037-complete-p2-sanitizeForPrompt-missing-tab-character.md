---
status: done
priority: p2
issue_id: "037"
tags: [code-review, security, prompt-injection]
dependencies: []
---

# `sanitizeForPrompt` Does Not Strip Tab Characters

## Problem Statement

`sanitizeForPrompt` collapses `\n` and `\r` but not `\t`. The curation prompt uses leading spaces to indicate indentation (`    title:`, `    subtitle:` etc.). A tab character injected into a post title or excerpt could disrupt the prompt's visual structure, and in adversarial framing could create a fake indented field that mimics the format of other prompt entries.

## Findings

**Location:** `src/lib/ai.ts:73-75`

```typescript
function sanitizeForPrompt(s: string): string {
  return s.replace(/[\n\r]/g, ' ').slice(0, 300)
  // \t not included
}
```

The curation prompt format relies on leading whitespace to signal field labels (e.g., `    title: ...`). A tab in a title value would render as an indented sub-entry, which the LLM might misparse as a separate structured field.

Raised by: security-sentinel.

## Proposed Solutions

### Option A: Add `\t` to the character class (Recommended)
```typescript
function sanitizeForPrompt(s: string): string {
  return s.replace(/[\n\r\t]/g, ' ').slice(0, 300)
}
```
- **Pros:** One-character change; closes the structural injection vector via tabs; consistent with intent of newline collapse
- **Effort:** Trivial
- **Risk:** None

### Option B: Expand to all Unicode whitespace
```typescript
s.replace(/\s/g, ' ')
```
- **Pros:** Catches all whitespace variants (vertical tab, form feed, etc.)
- **Cons:** Also collapses legitimate spaces in multi-word titles to single space (if used with collapse); over-broad
- **Risk:** Low but unnecessary for the threat model

## Recommended Action

Option A — add `\t` to the existing character class. One-character, zero risk.

## Technical Details

**Affected file:** `src/lib/ai.ts:73-75`

## Acceptance Criteria

- [ ] `sanitizeForPrompt` replaces `\t` with a space alongside `\n` and `\r`
- [ ] `npx tsc --noEmit` passes

## Work Log

- 2026-03-29: Identified during multi-agent review of PR #4 (security-sentinel)
