---
status: pending
priority: p3
issue_id: "056"
tags: [code-review, simplicity]
dependencies: [048]
---

# `sanitizeForPrompt(p.publishedAt).slice(0, 10)` Is Overengineered

## Problem Statement

`publishedAt` is an ISO datetime string from the Substack API (e.g. `"2024-01-15T10:00:00Z"`). `sanitizeForPrompt` slices to 300 chars and replaces `[\n\r\t]` with spaces. Neither operation has any effect on a well-formed ISO datetime string. The sanitization adds cognitive load without adding safety — a reader must trace through `sanitizeForPrompt` to confirm it's harmless on this field.

**Note:** This should be addressed *after* todo 048 (add format validation to Zod schema), which makes the safety argument explicit.

## Findings

**Location:** `src/lib/ai.ts:94`

```typescript
`    published: ${sanitizeForPrompt(p.publishedAt).slice(0, 10)}`,
```

Once `publishedAt` is validated as `/^\d{4}-\d{2}-\d{2}/` in the Zod schema (todo 048), a bare `.slice(0, 10)` is both correct and self-documenting.

## Proposed Solution

After todo 048 is resolved:
```typescript
`    published: ${p.publishedAt.slice(0, 10)}`,
```

## Technical Details

**Affected file:** `src/lib/ai.ts:94`
**Depends on:** todo 048 (publishedAt format validation in Zod)

## Acceptance Criteria

- [ ] `sanitizeForPrompt` removed from publishedAt formatting once Zod validates the format

## Work Log

- 2026-03-29: Found during code simplicity review of batch fixes (round 2)
