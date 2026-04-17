---
status: pending
priority: p2
issue_id: "119"
tags: [code-review, simplicity, quality]
dependencies: []
---

# Redundant Intermediate Variable Aliases for `courseTitle` and `courseDescription`

## Problem Statement

Lines 26-27 of `src/app/api/export/route.ts` introduce single-use aliases for `body.courseTitle` and `body.courseDescription`. These aliases add indirection without adding clarity — `body.courseTitle` and `body.courseDescription` are already expressive at their use sites.

## Findings

**Location:** `src/app/api/export/route.ts:26-27`

```ts
const courseTitle = body.courseTitle        // line 26
const courseDescription = body.courseDescription  // line 27
```

- `courseTitle` is used exactly twice: in `buildZip(body.lessons, courseTitle, courseDescription)` and in `courseTitle.toLowerCase()...`
- `courseDescription` is used exactly once: in `buildZip`
- Both are direct property accesses on a `const` — no transformation, no fallback

## Proposed Solutions

### Option A: Remove the aliases, use `body.*` directly (Recommended)
```ts
// Remove lines 26-27

// Line 31 becomes:
zipBuffer = await buildZip(body.lessons, body.courseTitle, body.courseDescription)

// Line 37 becomes:
const safeTitle = (body.courseTitle
  .toLowerCase()
  ...
```
- -2 lines, no behavior change
- Pros: Less cognitive load, fewer names to track
- Cons: `body.courseTitle` is slightly more verbose at use site (negligible)

### Option B: Keep aliases — they improve readability of the slug expression
Current: `const safeTitle = (courseTitle.toLowerCase()...`
Alternative: `const safeTitle = (body.courseTitle.toLowerCase()...`
The alias version is slightly more readable in the multi-line slug expression. Reasonable argument to keep.

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/app/api/export/route.ts:26-27`
- **Effort:** Small

## Acceptance Criteria

- [ ] `courseTitle` and `courseDescription` variables removed (or kept with documented reason)
- [ ] No behavior change

## Work Log

- 2026-04-16: Identified by code simplicity reviewer during code review of PR `fix/export-edge-cases-060-061-062`

## Resources

- PR branch: `fix/export-edge-cases-060-061-062`
- Affected file: `src/app/api/export/route.ts:26-27`
