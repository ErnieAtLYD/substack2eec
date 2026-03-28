---
status: pending
priority: p2
issue_id: "028"
tags: [code-review, reliability, download]
dependencies: []
---

# `revokeObjectURL` Timeout Is 60ms — Too Short for Reliable Downloads

## Problem Statement

The deferred `URL.revokeObjectURL` call in `handleDownload` uses a 60ms timeout. This is too short on slow devices or with large ZIP files — the browser's download manager may not have had time to consume the blob URL before it is revoked, causing a silent download failure with no error shown to the user.

**Why it matters:** Download failures are silent. The user sees the step return to `'review'` with no error banner, and the ZIP file is either empty or absent. On mobile or slow connections this can happen consistently.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:250`

```typescript
setTimeout(() => URL.revokeObjectURL(href), 60)  // ← 60ms is too short
```

The canonical practice is 1,000ms–60,000ms (1 second to 1 minute). The intent was clearly to add a safety grace period, but `60` without the `_000` suffix gives only 60 milliseconds.

**Note:** Fixed in the follow-up commit after PR #3 review — timeout updated to `60_000` (1 minute). This todo tracks the rationale and acceptance criteria.

## Proposed Solutions

### Option A: Use 60_000ms (1 minute) — Recommended ✅
```typescript
setTimeout(() => URL.revokeObjectURL(href), 60_000)
```
- **Pros:** Standard practice; safe for all device speeds and ZIP sizes; memory is released eventually
- **Cons:** Object URL held in memory for 1 minute (negligible for a single blob)
- **Effort:** Trivial

### Option B: Use 5_000ms (5 seconds)
- **Pros:** Shorter memory hold than 1 minute
- **Cons:** Still short on very slow devices
- **Effort:** Trivial

## Recommended Action

Option A — `60_000ms`. Already implemented in fix commit.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:250`

## Acceptance Criteria

- [x] `setTimeout(() => URL.revokeObjectURL(href), 60_000)` — 1 minute grace period
- [ ] Manual test: clicking Download ZIP on a slow-network simulation does not produce a broken/empty download
- [ ] No path leaves `step` stuck at `'downloading'`

## Work Log

- 2026-03-28: Finding from PR #3 review (TypeScript reviewer + security sentinel)
- 2026-03-28: Fixed in follow-up commit — changed `60` to `60_000`

## Resources

- PR #3: `feat/ui-redesign-centered-layout`
- MDN: `URL.revokeObjectURL()` — "For security reasons, browsers automatically invalidate object URLs when a document is closed, but you should still revoke them manually when no longer needed"
