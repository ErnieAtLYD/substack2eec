---
status: complete
priority: p2
issue_id: "107"
tags: [code-review, documentation, maintainability]
dependencies: []
---

# Load-Bearing Comments Removed in Restyle

## Problem Statement

Four inline comments that explain non-obvious architectural decisions were removed during the `add-some-color` visual restyle. These comments are not decorative — they document why certain code paths exist and protect against "cleanup" regressions by future developers or agents who might treat the patterns as bugs.

## Findings

**1. `selection` SSE event no-op (original line ~224)**

When `selectedCourse` is pre-supplied, `courseMeta` is already set from the confirmed candidate before the stream opens. The `selection` SSE event fires but is intentionally ignored for state purposes — only used to populate the stream log. Without the comment, this looks like an incomplete handler.

Original comment: `// courseMeta already set from confirmed candidate — selection event is informational only`

**2. Partial lessons on error → `setStep('review')` (original line ~240)**

The error branch checks `inProgressLessons.length > 0` and navigates to the review step rather than staying in generating/picking. Without the comment, this looks like error handling that navigates away from the error state, which seems wrong.

Original comment: `// If we have partial lessons, let user review what arrived`

**3. Stream crash recovery from sessionStorage (original line ~252)**

The `catch` block in `handleConfirmCandidate` re-reads from sessionStorage rather than clearing state. Without the comment, this looks like a stale read or a bug where crash recovery is inconsistent.

Original comment: `// Recover partial lessons from sessionStorage if stream died`

**4. Silent catch in `writeSessionLessons` (removed with comment)**

The `catch {}` body after the `QuotaExceededError` check previously had: `// Silently ignore other errors (SSR environment, private mode, etc.)`. The empty catch body without explanation will trigger static analysis warnings and looks like swallowed errors.

**Affected file:** `src/components/features/ReviewForm.tsx`

## Proposed Solutions

### Option A — Restore the four comments in place (Recommended)

Re-add each comment at the appropriate code location. No logic change required.

```typescript
// courseMeta already set from confirmed candidate — selection event is informational only
if (event.type === 'selection') { ...

// If we have partial lessons, let user review what arrived
if (inProgressLessons.length > 0) { ...

// Recover partial lessons from sessionStorage if stream died
const saved = readSessionLessons()

// Silently ignore other errors (SSR environment, private browsing, etc.)
}  // empty catch
```

- **Effort:** Tiny | **Risk:** None

### Option B — Add a JSDoc block to each handler explaining the dual path

More thorough but heavier. Only worthwhile if the component is expected to be modified frequently by new contributors.

- **Effort:** Small | **Risk:** None

## Recommended Action

Option A. These comments prevent incorrect "fixes" to correct code.

## Technical Details

**Affected file:** `src/components/features/ReviewForm.tsx`  
Sections: `handleConfirmCandidate` function, `writeSessionLessons` function

## Acceptance Criteria

- [x] `selection` event no-op is annotated explaining it is intentionally informational
- [x] Partial-lessons error recovery path is annotated explaining why it navigates to review
- [x] Stream crash recovery is annotated explaining the sessionStorage re-read intent
- [x] Silent catch in `writeSessionLessons` is annotated for SSR/private mode

## Work Log

- 2026-04-13: Found by agent-native-reviewer on `add-some-color` branch review
