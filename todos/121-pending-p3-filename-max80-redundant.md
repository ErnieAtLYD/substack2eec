---
status: pending
priority: p3
issue_id: "121"
tags: [code-review, simplicity, zod]
dependencies: []
---

# `.max(80)` on `filename` Field Is Redundant Given the Regex Constraint

## Problem Statement

The filename validation has both a regex and a `.max(80)` length constraint. The regex `/^[a-z0-9][a-z0-9-]+\.md$/` already structurally limits the filename to realistic lengths — any slug produced by the AI will be well under 80 chars. The `.max(80)` adds no protection beyond what the regex already ensures and creates a false impression that 79-char filenames are valid (they may not be, depending on filesystem limits, but 80 is an arbitrary number here).

## Findings

**Location:** `src/app/api/export/route.ts:13`

```ts
filename: z.string().regex(/^[a-z0-9][a-z0-9-]+\.md$/).max(80),
```

The regex anchors `^...$` and uses character classes that in practice limit filenames to whatever slug length the AI generates. `.max(80)` fires only if someone crafts a 81+ character all-lowercase-alphanumeric-hyphen filename ending in `.md` — an edge case that never occurs in real usage.

## Proposed Solutions

### Option A: Remove `.max(80)` (Recommended)
```ts
filename: z.string().regex(/^[a-z0-9][a-z0-9-]+\.md$/),
```
- Simpler, one fewer constraint to maintain
- Pros: Less noise, the regex is the real constraint
- Cons: Technically no explicit upper bound (but regex makes this academic)

### Option B: Keep for defense-in-depth
The `.max(80)` is cheap and provides a documented upper bound even if it's currently unreachable. Keep it for clarity.

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/app/api/export/route.ts:13`
- **Effort:** Trivial

## Work Log

- 2026-04-16: Identified by code simplicity reviewer during code review of PR `fix/export-edge-cases-060-061-062`
