---
status: pending
priority: p3
issue_id: "040"
tags: [code-review, simplicity, quality]
dependencies: []
---

# `sanitizeForPrompt` Applied to `slug` Unnecessarily; `300` Magic Number Should Be a Named Constant

## Problem Statement

Two related simplicity issues in `sanitizeForPrompt` and its callsites:

1. **`slug` sanitization is redundant.** Substack slugs are URL path segments constrained to `[a-z0-9-]`. They cannot contain newlines, tabs, or any character that `sanitizeForPrompt` defends against. Calling `sanitizeForPrompt(p.slug)` adds noise without adding safety, and misleads future readers into thinking slugs are untrusted in the same way as `excerpt`.

2. **`300` is a magic number.** The 300-character cap inside `sanitizeForPrompt` is not explained or named. Future editors cannot tell whether this was carefully chosen or arbitrary, and cannot find it without grepping inside the function body.

## Findings

**Location:** `src/lib/ai.ts:73-75, 81`

```typescript
function sanitizeForPrompt(s: string): string {
  return s.replace(/[\n\r]/g, ' ').slice(0, 300)  // 300 = ?
}
...
`[${i + 1}] slug: ${sanitizeForPrompt(p.slug)}`,  // slug is [a-z0-9-] by construction
```

Raised by: code-simplicity-reviewer, aa2d497913f6befe5.

## Proposed Solutions

### Option A: Remove `sanitizeForPrompt` from `slug`; extract constant (Recommended)
```typescript
const MAX_PROMPT_FIELD_LEN = 300

function sanitizeForPrompt(s: string): string {
  return s.replace(/[\n\r\t]/g, ' ').slice(0, MAX_PROMPT_FIELD_LEN)
}

// In formatPostsForCuration:
`[${i + 1}] slug: ${p.slug}`,  // slug is [a-z0-9-] — no sanitization needed
```
- **Pros:** Removes misleading call; names the constant; consistent with how `p.wordCount` and `p.publishedAt` are used directly
- **Effort:** Trivial
- **Risk:** None — removing sanitization from a field that is already clean

### Option B: Keep `slug` sanitization, only extract constant
- **Pros:** More defensive (no assumption about slug format from third-party API)
- **Cons:** Leaves the misleading implication that slug is untrusted in the same way as user-authored content

## Recommended Action

Option A. Slug format is enforced by Substack's URL structure. The sanitization is genuinely redundant.

## Technical Details

**Affected file:** `src/lib/ai.ts:73-75, 81`

## Acceptance Criteria

- [ ] `sanitizeForPrompt` not called on `p.slug`
- [ ] The `300` cap is extracted to a named module-level constant
- [ ] `npx tsc --noEmit` passes

## Work Log

- 2026-03-29: Identified during multi-agent review of PR #4 (code-simplicity-reviewer)
