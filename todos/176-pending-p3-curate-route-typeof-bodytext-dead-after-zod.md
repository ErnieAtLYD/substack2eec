---
status: pending
priority: p3
issue_id: "176"
tags: [code-review, dead-code, type-safety]
dependencies: []
---

# `typeof p.bodyText === 'string'` Check In `/api/curate` Is Dead Code After Zod Validation

## Problem Statement

`SubstackPostSchema.bodyText` is `z.string().max(100_000)`. Zod has already coerced/rejected by the time the route maps over `body.posts`. The `typeof p.bodyText === 'string' ? ... : ''` guard at `route.ts:33` cannot be false at runtime.

Flagged by kieran-typescript-reviewer (P2; demoted to p3 here as cosmetic).

## Findings

**Location:** `src/app/api/curate/route.ts:33`

```ts
bodyText: truncateTextToWords(
  (typeof p.bodyText === 'string' ? p.bodyText : '').slice(0, MAX_BODY_CHARS),
  MAX_POST_WORDS,
)
```

## Proposed Solutions

### Option A: Drop the guard (recommended)

```ts
bodyText: truncateTextToWords(p.bodyText.slice(0, MAX_BODY_CHARS), MAX_POST_WORDS)
```

- Pros: Trusts the type system. Two lines shorter.
- Cons: None — Zod is the trust boundary above this code.
- Effort: Trivial.

### Option B: Keep the guard, document why

If there's a fear of bypass via a future schema change.

- Pros: Defensive.
- Cons: Defensive against a hypothesis with no concrete failure mode.
- Effort: Trivial doc.

## Recommended Action

_Pending triage._ Option A.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts`

## Acceptance Criteria

- [ ] No `typeof === 'string'` guards on already-validated Zod fields

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/app/api/curate/route.ts:33`
