---
status: complete
priority: p2
issue_id: "048"
tags: [code-review, security, zod, prompt-injection]
dependencies: []
---

# `publishedAt` Accepts Any String in Zod Schema — Format Should Be Validated

## Problem Statement

`publishedAt` is accepted as `z.string()` with no format validation. The field is used in the curation prompt after going through `sanitizeForPrompt(...).slice(0, 10)`. While the 10-char slice severely limits what can be injected, the Zod schema is the right layer to enforce that this field is actually a date string. A value like `Ignore all` passes all current sanitization and appears in the prompt.

## Findings

**Location:** `src/app/api/curate/route.ts:17`

```typescript
publishedAt: z.string(),   // accepts any string
```

**In prompt construction** (`src/lib/ai.ts:94`):
```typescript
`    published: ${sanitizeForPrompt(p.publishedAt).slice(0, 10)}`,
```

`sanitizeForPrompt` collapses whitespace and slices to 300 chars; the trailing `.slice(0, 10)` limits output to 10 chars. This narrows the injection window to 10 characters of arbitrary text. Still, `Ignore al` (9 chars) or similar could appear in the prompt. The structured prompt and forced tool-use substantially reduce exploitability, but format validation is cheap and eliminates the surface entirely.

## Proposed Solutions

### Option A: Add date regex to schema (Recommended)
```typescript
publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
```
This validates that the string starts with an ISO date prefix, which is all that matters since only 10 chars are used.

### Option B: Use Zod's built-in datetime validator
```typescript
publishedAt: z.string().datetime({ offset: true }),
```
More thorough but may be too strict if some Substack posts use a different format.

### Option C: Transform to date-safe slice in schema
```typescript
publishedAt: z.string().transform(s => s.slice(0, 10)).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
```

## Recommended Action

Option A. The regex is minimal and matches the actual usage (first 10 chars, ISO date format).

## Technical Details

**Affected file:** `src/app/api/curate/route.ts:17`

## Acceptance Criteria

- [ ] `publishedAt` validated with date-format regex or Zod datetime validator
- [ ] Non-date strings rejected at the API boundary

## Work Log

- 2026-03-29: Found during security review of batch fixes (round 2)
