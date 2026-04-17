---
status: complete
priority: p2
issue_id: "060"
tags: [code-review, simplicity, zod]
dependencies: []
---

# `courseTitle` Default Logic Split Between Zod Schema and Use Site

## Problem Statement

`ExportRequestSchema` accepts `courseTitle: z.string().max(200)` (allows empty string), but the use site does `body.courseTitle || 'Email Course'` to handle both the empty-string and missing-field cases. This is a split contract: the schema says "any string including empty" but the use site silently corrects empty to a default. Adding `.min(1)` or `.default()` to the schema consolidates the logic in one place and makes the contract explicit.

## Findings

**Location:** `src/app/api/export/route.ts:15` (schema) and `:26` (use site)

```typescript
courseTitle: z.string().max(200),      // accepts ""
// ...
const courseTitle = body.courseTitle || 'Email Course'  // corrects "" silently
```

The `||` fallback fires for both `undefined` (impossible after Zod parse) and `""` (valid per schema). A caller sending `courseTitle: ""` gets the default silently — which may be intentional, but it's not expressed in the schema.

## Proposed Solutions

### Option A: Add `.min(1)` and `.default()` to schema (Recommended)
```typescript
courseTitle: z.string().min(1).max(200).default('Email Course'),
// use site becomes:
const courseTitle = body.courseTitle
```
Rejects empty string with a 400; uses the default when field is omitted.

### Option B: Use `.catch()` for silent coercion
```typescript
courseTitle: z.string().max(200).catch('Email Course'),
// use site: const courseTitle = body.courseTitle
```
Silently coerces invalid/empty to the default. Matches current `||` behavior.

## Recommended Action

Option A. Empty `courseTitle` should probably be rejected (it produces a bad ZIP filename), and `.default()` handles the missing-field case.

## Technical Details

**Affected file:** `src/app/api/export/route.ts:15, 26`

## Acceptance Criteria

- [ ] Schema expresses the default and minimum length for `courseTitle`
- [ ] `|| 'Email Course'` removed from use site

## Work Log

- 2026-03-29: Found during simplicity and TypeScript review of P1 fixes
