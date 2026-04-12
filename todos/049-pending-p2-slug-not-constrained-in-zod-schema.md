---
status: pending
priority: p2
issue_id: "049"
tags: [code-review, security, zod, prompt-injection]
dependencies: []
---

# `slug` Field Accepts Arbitrary String in Zod Schema Despite Being Used Raw in Prompt

## Problem Statement

`src/lib/ai.ts` comments `// slug is [a-z0-9-], safe` and embeds `p.slug` directly in the curation prompt without sanitization. However, the Zod schema only validates `slug: z.string().max(500)` — it does not enforce the `[a-z0-9-]` character set. A direct API caller can submit a slug with newlines, XML-like markup, or prompt-injection text.

## Findings

**Location:** `src/app/api/curate/route.ts:12` (Zod schema) and `src/lib/ai.ts:91` (usage)

In the schema:
```typescript
slug: z.string().max(500),   // accepts any characters
```

In the prompt:
```typescript
`[${i + 1}] slug: ${p.slug}`,   // comment says "[a-z0-9-], safe" — but this is not enforced
```

The slug is also used as a Map key (`postsBySlug.get(curatedLesson.slug)`) where `curatedLesson.slug` comes from Claude's tool output, so an injection that causes Claude to return a slug containing arbitrary characters could produce unexpected map behavior.

**When the assumption holds:** When posts come from the Substack API via `/api/fetch-posts`. When posts come directly from a client bypassing `/api/fetch-posts`, any slug is accepted.

## Proposed Solutions

### Option A: Add regex constraint to Zod schema (Recommended)
```typescript
slug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).max(200),
```
This enforces the assumption the code comment relies on, at the API boundary.

### Option B: Apply `sanitizeForPrompt` to slug
Revert the earlier change and sanitize slug in `formatPostsForCuration`.
- **Cons:** Less precise than enforcing the format constraint; allows non-slug characters

## Recommended Action

Option A. The regex is the exact constraint the code assumes; enforce it at the schema level.

## Technical Details

**Affected files:** `src/app/api/curate/route.ts:12` (schema), `src/lib/ai.ts:91` (usage comment)

## Acceptance Criteria

- [ ] `slug` field in `CurateRequestSchema` has regex `^[a-z0-9][a-z0-9-]*[a-z0-9]$`
- [ ] The comment in `ai.ts` is validated by the schema, not just assumed

## Work Log

- 2026-03-29: Found during security review of batch fixes (round 2)
