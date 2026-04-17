---
status: complete
priority: p3
issue_id: "120"
tags: [code-review, zod, consistency]
dependencies: [116]
---

# `courseDescription` Has No `.min(1)` or `.default()` — Inconsistent with `courseTitle`

## Problem Statement

After this PR, `courseTitle` requires `.min(1)` while `courseDescription` accepts empty string silently (`z.string().max(1000)`). The inconsistency creates ambiguity: is an empty description intentionally allowed, or was it overlooked? An empty description passed to `buildZip` will produce a blank line in the exported README.

## Findings

**Location:** `src/app/api/export/route.ts:16`

```ts
courseDescription: z.string().max(1000),  // accepts ""
```

vs.

```ts
courseTitle: z.string().min(1).max(200).default('Email Course'),  // rejects ""
```

## Proposed Solutions

### Option A: Add `.default('')` for symmetry
```ts
courseDescription: z.string().max(1000).default(''),
```
- Makes omitted field equivalent to empty string (already the case, but explicit)
- Pros: Documents intent, consistent with courseTitle's default pattern
- Cons: Empty description is still allowed, just explicit

### Option B: Add `.min(1).default('')` to match courseTitle treatment
Only if empty description in the ZIP README is actually undesirable.

### Option C: Leave as-is with a comment documenting intent
```ts
courseDescription: z.string().max(1000),  // empty string is valid; README will have blank description
```

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/app/api/export/route.ts:16`
- **Effort:** Small

## Acceptance Criteria

- [ ] Intentional decision made and reflected in schema or comment

## Work Log

- 2026-04-16: Identified by agent-native reviewer and TypeScript reviewer during code review of PR `fix/export-edge-cases-060-061-062`

## Resources

- PR branch: `fix/export-edge-cases-060-061-062`
