---
status: complete
priority: p2
issue_id: "118"
tags: [code-review, correctness, content-disposition]
dependencies: []
---

# `safeTitle` Trailing-Hyphen Strip Runs Before `.slice()` — Produces Double-Hyphen in Long Titles

## Problem Statement

The `safeTitle` slugification in the export route strips leading/trailing hyphens before slicing to 50 characters. If the slice truncation point falls on a hyphen, the result retains a trailing hyphen, producing a filename like `my-very-long-course-title-with-many-words-here--eec.zip` (double hyphen at the junction with `-eec`).

## Findings

**Location:** `src/app/api/export/route.ts:37-41`

Current order:
```ts
const safeTitle = (courseTitle
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')  // collapse non-alphanum to hyphens
  .replace(/^-|-$/g, '')         // strip leading/trailing hyphens  ← runs BEFORE slice
  .slice(0, 50))                 // truncation — can re-introduce trailing hyphen
  || 'email-course'
```

Example: `courseTitle = "My Very Long Course Title With Many Words Here XYZ"`
- After replace: `my-very-long-course-title-with-many-words-here-xyz`
- After strip: `my-very-long-course-title-with-many-words-here-xyz` (no change)
- After slice(0,50): `my-very-long-course-title-with-many-words-here-` (trailing hyphen!)
- Final filename: `my-very-long-course-title-with-many-words-here--eec.zip`

This is a pre-existing issue (not introduced by this PR), but the PR is touching this exact line and is the right time to fix it.

## Proposed Solutions

### Option A: Move strip to after the slice (Recommended)
```ts
const safeTitle = (courseTitle
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .slice(0, 50)
  .replace(/^-|-$/g, '')) || 'email-course'
```
- Strip after slice → trailing hyphen from truncation is removed
- Pros: Correct order, no behavior change for titles ≤50 chars, fixes the double-hyphen case
- Cons: None

### Option B: Slice then strip (same as Option A, just explicit naming)
Same as above — the canonical correct implementation.

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/app/api/export/route.ts:37-41`
- **Components:** ZIP Content-Disposition filename generation

## Acceptance Criteria

- [ ] A `courseTitle` that produces a 50-char slug ending in a hyphen results in a filename like `my-very-long-course-title-with-many-words-here-eec.zip` (no double hyphen)
- [ ] Short titles (≤50 chars) produce identical output to current behavior

## Work Log

- 2026-04-16: Identified by TypeScript reviewer during code review of PR `fix/export-edge-cases-060-061-062`

## Resources

- PR branch: `fix/export-edge-cases-060-061-062`
- Affected file: `src/app/api/export/route.ts:37-41`
