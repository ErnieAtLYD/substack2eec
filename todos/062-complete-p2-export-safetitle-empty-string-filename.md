---
status: complete
priority: p2
issue_id: "062"
tags: [code-review, correctness]
dependencies: [060]
---

# `safeTitle` Can Be Empty String — Produces `-eec.zip` Filename

## Problem Statement

If `courseTitle` contains only non-ASCII characters (e.g., a Japanese or emoji title), the slugification pipeline reduces it to an empty string, and the ZIP `Content-Disposition` filename becomes `-eec.zip` (leading hyphen, because the template is `` `${safeTitle}-eec.zip` ``).

## Findings

**Location:** `src/app/api/export/route.ts:37-48`

```typescript
const safeTitle = courseTitle
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')  // "日本語" → "-"
  .replace(/^-|-$/g, '')         // "-" → ""
  .slice(0, 50)                  // "" → ""

// safeTitle is now ""; filename becomes "-eec.zip"
'Content-Disposition': `attachment; filename="${safeTitle}-eec.zip"`,
```

**Note:** This is addressed upstream if todo 060 (`courseTitle: z.string().min(1)`) is fixed, but the slugification pipeline should still have a safe fallback for defense-in-depth, since future code paths might reach this without going through the Zod schema.

## Proposed Solution

Add a fallback after slugification:
```typescript
const safeTitle = (courseTitle
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 50)) || 'email-course'
```

## Technical Details

**Affected file:** `src/app/api/export/route.ts:37-44`
**Depends on:** todo 060 (closes the upstream empty courseTitle path)

## Acceptance Criteria

- [ ] A non-ASCII `courseTitle` produces a valid, non-leading-hyphen ZIP filename
- [ ] Fallback is `'email-course'` or similar

## Work Log

- 2026-03-29: Found during TypeScript review of P1 fixes
