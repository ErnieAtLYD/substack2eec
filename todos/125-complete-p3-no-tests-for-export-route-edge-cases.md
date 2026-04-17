---
status: complete
priority: p3
issue_id: "125"
tags: [code-review, testing, quality]
dependencies: []
---

# No Tests for Export Route Edge Cases Fixed by This PR

## Problem Statement

This PR fixes three specific edge cases in `/api/export` (empty safeTitle, single-char filename stems, courseTitle default contract). There are no regression tests for any of these cases. Without tests, these edge cases could silently regress in future refactors. The three completed todo docs (060, 061, 062) each map naturally to a test case.

## Findings

**Location:** `src/__tests__/` — no export route test file exists

Tests exist for middleware but not for the export route. The fixed edge cases are:
1. `courseTitle: ""` → was graceful fallback, now 400 (or vice versa after fix to 116)
2. Filename `a.md` (single-char stem) → rejected by new regex
3. All-symbol `courseTitle` like `"!!!"` → `safeTitle` falls back to `'email-course'`
4. Long `courseTitle` that truncates at a hyphen → double-hyphen edge case (todo 118)

## Proposed Solutions

### Option A: Add unit tests for export route validation (Recommended)
```ts
// src/__tests__/export-route.test.ts
describe('POST /api/export', () => {
  it('accepts valid request and returns ZIP', ...)
  it('rejects empty lessons array', ...)
  it('rejects single-char stem filename like a.md', ...)
  it('accepts courseTitle omitted and uses default', ...)
  it('handles all-symbol courseTitle falling back to email-course slug', ...)
  it('strips trailing hyphen when title truncates at 50-char boundary', ...)
})
```

### Option B: Add integration tests using a test harness

### Option C: Defer — export route is simple enough to validate manually

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/__tests__/export-route.test.ts` (new file)
- **Effort:** Medium
- **Dependencies:** Resolve 116 first (courseTitle behavior must be settled before writing tests)

## Work Log

- 2026-04-16: Identified by TypeScript reviewer during code review of PR `fix/export-edge-cases-060-061-062`
