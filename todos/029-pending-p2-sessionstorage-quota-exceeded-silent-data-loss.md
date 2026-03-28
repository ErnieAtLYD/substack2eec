---
status: pending
priority: p2
issue_id: "029"
tags: [code-review, reliability, data-loss, sessionstorage]
dependencies: []
---

# `sessionStorage` QuotaExceededError Silently Swallowed — Mid-Generation Data Loss

## Problem Statement

`writeSessionLessons` and `writeSessionMeta` silently discard data when `sessionStorage.setItem` throws `QuotaExceededError`. The catch block comment says `// sessionStorage not available (SSR guard)` but also hides write failures. In PR #3, `writeSessionLessons` is now called incrementally on every `lesson_done` SSE event — making mid-generation quota exhaustion a real scenario with large lesson sets.

**Why it matters:** The user generates 10 lessons at 2,500 words each (plus `bodyHtml`) — total serialized size can easily exceed the typical 5 MB `sessionStorage` cap. When the cap is hit mid-stream, writes silently fail. On page refresh or network interruption, the recovery path (`readSessionLessons`) returns `null` and all in-progress work is lost with no warning to the user.

## Findings

**Location:** `src/components/features/ReviewForm.tsx:47–53`

```typescript
function writeSessionLessons(lessons: GeneratedLesson[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(lessons))
  } catch {
    // sessionStorage not available (SSR guard)   ← hides QuotaExceededError too
  }
}
```

The comment reveals the intent was only to guard against SSR (where `sessionStorage` doesn't exist). But the empty catch also silently swallows `QuotaExceededError` from storage quota violations on real browsers.

## Proposed Solutions

### Option A: Distinguish error types and warn user (Recommended)
```typescript
function writeSessionLessons(lessons: GeneratedLesson[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(lessons))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('sessionStorage quota exceeded — lesson progress will not be saved on refresh')
      // Optionally: surface a non-blocking toast/banner to the user
    }
    // Silently ignore other errors (SSR, private mode, etc.)
  }
}
```
- **Pros:** User is informed; existing SSR guard still works; no behavior change for normal usage
- **Cons:** Requires surfacing the warning state up to the component (or using a toast)
- **Effort:** Small

### Option B: Store only the latest N lessons instead of all
- Limit `sessionStorage` writes to the most recent 5 lessons to stay under quota
- **Pros:** Prevents quota exhaustion
- **Cons:** Loses full-session restore for large runs
- **Effort:** Small

### Option C: Use `localStorage` with explicit size check
- `localStorage` has the same 5 MB cap; same problem
- **Not recommended**

## Recommended Action

Option A: distinguish `QuotaExceededError` and surface a user-visible warning when it occurs.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx` — `writeSessionLessons` (line 47), `writeSessionMeta` (line 26)

**Why PR #3 makes this worse:** Before the PR, `writeSessionLessons` was only called at generation completion (the `done` event). After the PR (line 192), it is called for every `lesson_done` event — up to 10 times per generation. Each call serializes the full (and growing) lessons array. The 5th or 6th call is most likely to exceed quota.

## Acceptance Criteria

- [ ] `writeSessionLessons` logs a console warning (at minimum) when `QuotaExceededError` is thrown
- [ ] The SSR guard (non-`QuotaExceededError` catch) still works silently
- [ ] Ideally: user sees a non-blocking banner like "Your progress may not be saved — browser storage is full"
- [ ] No change to normal-case behavior when quota is not exceeded

## Work Log

- 2026-03-28: Finding from PR #3 security review (security sentinel)

## Resources

- PR #3: `feat/ui-redesign-centered-layout`
- MDN: `DOMException.QuotaExceededError`
- Browser limits: Chrome/Firefox/Safari typically allow 5–10 MB per origin for sessionStorage
