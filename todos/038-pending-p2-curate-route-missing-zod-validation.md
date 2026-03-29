---
status: pending
priority: p2
issue_id: "038"
tags: [code-review, security, api, validation]
dependencies: []
---

# `/api/curate` Body Has No Runtime Schema Validation — `wordCount` Unsafe as Non-Number

## Problem Statement

`/api/curate/route.ts` casts the request body directly to `CurateRequest` with no Zod or runtime validation. TypeScript's type assertion provides zero runtime safety. An attacker can POST arbitrary field shapes directly to `/api/curate`, bypassing the `/api/fetch-posts` Substack pipeline entirely. This makes `src/lib/ai.ts` the sole defense line for direct API callers rather than a defense-in-depth layer.

The most concrete risk: `post.wordCount` is a `number` in the TypeScript type, but at runtime a POST body can supply a string. Template literal interpolation coerces it silently — an attacker could supply a crafted string as `wordCount` and inject content into the curation prompt line `    words: ${p.wordCount}`.

## Findings

**Location:** `src/app/api/curate/route.ts:13-26`

```typescript
const body: CurateRequest = await request.json()
// No validation — TypeScript type assertion only
```

Currently `sanitizeForPrompt` is applied to `slug`, `title`, `subtitle`, `excerpt` — but NOT to `wordCount`. If `wordCount` is a string at runtime, it bypasses all sanitization and is interpolated directly into the prompt.

Raised by: security-sentinel.

## Proposed Solutions

### Option A: Add Zod schema validation at route boundary (Recommended)
```typescript
import { z } from 'zod'

const SubstackPostSchema = z.object({
  slug: z.string().max(500),
  title: z.string().max(500),
  subtitle: z.string().max(500).optional(),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  wordCount: z.number().int().min(0).max(100000),
  excerpt: z.string().max(500),
  bodyText: z.string().max(50000),
})

const CurateRequestSchema = z.object({
  posts: z.array(SubstackPostSchema).min(1).max(200),
  lessonCount: z.number().int().min(1).max(20),
})
```

- **Pros:** Runtime type safety; makes `ai.ts` sanitization defense-in-depth rather than sole gate; surfaces bad input with a clean 400 error
- **Effort:** Small
- **Risk:** None — Zod already a common Next.js dependency

### Option B: Apply `sanitizeForPrompt` defensively to `wordCount` after `String()` coercion
```typescript
`    words: ${sanitizeForPrompt(String(p.wordCount))}`,
```
- **Pros:** Closes the immediate `wordCount` injection gap without adding Zod
- **Cons:** Symptom fix; doesn't address the broader lack of runtime validation; `wordCount` should be a number, not a string

## Recommended Action

Option A for the route, but Option B as an immediate patch for `wordCount` if Zod is not yet in the project. Both can coexist.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts`
- `src/lib/ai.ts:82` — `wordCount` line

## Acceptance Criteria

- [ ] `/api/curate` validates request body with Zod (or equivalent) before calling `curatePostSelection`
- [ ] Invalid `wordCount` (non-number) results in a 400 error, not silent coercion
- [ ] All string fields have max-length constraints enforced at the route boundary
- [ ] `npx tsc --noEmit` passes

## Work Log

- 2026-03-29: Identified during multi-agent review of PR #4 (security-sentinel)
