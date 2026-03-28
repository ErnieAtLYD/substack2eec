---
status: complete
priority: p1
issue_id: "013"
tags: [code-review, correctness, state-management]
dependencies: []
---

# `handleDownload` Resets Step Unconditionally — Success and Failure Paths Look Identical

## Problem Statement

After the download logic runs, `setStep('review')` executes unconditionally regardless of whether the download succeeded or failed. Success and error states are both silently resolved to `step === 'review'`. A future refactor (e.g., adding a success toast or transitioning to a different step) is likely to break this silently. The intent is unclear from reading the code.

**Why it matters:** Subtle correctness issue that works today by coincidence. TypeScript cannot catch this because `setStep` is always valid. The success path has no explicit post-download state transition.

## Findings

**Location:** `src/components/features/ReviewForm.tsx`, lines 225–248 (approximate)

```typescript
async function handleDownload() {
  setStep('downloading')
  try {
    // ... fetch /api/export, create anchor, click ...
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } catch (err) {
    setError(...)
  } finally {
    setStep('review')   // ❌ runs whether download succeeded or failed
  }
}
```

The `finally` block (or equivalent unconditional reset) means: on success, the anchor fires and immediately the step snaps back to 'review'. On failure, the error is set and the step also snaps back. The UI has no distinct "download succeeded" state.

## Proposed Solutions

### Option A — Make both paths explicit (Recommended)

```typescript
async function handleDownload() {
  setStep('downloading')
  try {
    // ... fetch, create anchor, click ...
    setStep('review')   // explicit: success goes back to review
  } catch (err) {
    setError(...)
    setStep('review')   // explicit: error also goes back to review
  }
  // no finally — both paths are handled
}
```

- **Pros:** Both outcomes are explicit; `finally` cannot mask future intent
- **Cons:** Slight duplication of `setStep('review')`
- **Effort:** Small | **Risk:** Very Low

### Option B — Add a `downloaded` step with success feedback

Add a brief "Downloaded!" confirmation state that transitions back to `review` after 2 seconds.
- **Pros:** Better UX
- **Cons:** Larger change, adds complexity
- **Effort:** Medium | **Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `src/components/features/ReviewForm.tsx`
- **Components:** `handleDownload`

## Acceptance Criteria

- [ ] Download success and download failure paths are both explicit with their own `setStep` calls
- [ ] No `finally`-based state reset that applies equally to success and failure

## Work Log

- 2026-03-27: Surfaced by TypeScript reviewer agent during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
