---
title: "fix: Resolve P2 pre-merge todos 015, 023, 024, 025, 029"
type: fix
status: active
date: 2026-03-28
---

# fix: Resolve P2 Pre-Merge Todos Before Landing feat/ui-redesign-centered-layout

## Overview

Five P2 findings from the PR #3 review must be resolved before merging. All five touch `src/components/features/ReviewForm.tsx`. No API or type contract changes are needed. Total diff is approximately 20 lines.

**Todos addressed:** 015, 023, 024, 025, 029

---

## Problem Statement

| # | Todo | File | Risk |
|---|------|------|------|
| 1 | [015] `lessonCount` state is dead — selector removed, imports unused | `ReviewForm.tsx` | Misleading code |
| 2 | [023] URL input placeholder `yourname.substack.com` fails `type="url"` browser validation | `ReviewForm.tsx` | UX breakage |
| 3 | [024] Submit button missing `disabled` attribute and visual state | `ReviewForm.tsx` | Accessibility / double-submit |
| 4 | [025] `lessons.length < lessonCount` compares against dead state instead of `expectedLessonCount` | `ReviewForm.tsx` | Incorrect warning shown to users |
| 5 | [029] `QuotaExceededError` silently swallowed in `writeSessionLessons` / `writeSessionMeta` | `ReviewForm.tsx` | Silent mid-generation data loss |

---

## Fix 1 — Remove dead `lessonCount` state (todo 015)

**File:** `src/components/features/ReviewForm.tsx`

### What to remove / replace

**Line 4** — remove `LessonCount` from the type import:
```typescript
// Before
import type { SubstackPost, GeneratedLesson, CurateSSEEvent, LessonCount } from '@/types'
// After
import type { SubstackPost, GeneratedLesson, CurateSSEEvent } from '@/types'
```

**Line 5** — delete entirely:
```typescript
import { ALLOWED_LESSON_COUNTS } from '@/types'
```

**Line 70** — delete the dead state:
```typescript
const [lessonCount, setLessonCount] = useState<LessonCount>(5)  // ← delete
```

**Line 77** — replace `lessonCount` initializer with literal `5`:
```typescript
// Before
const [expectedLessonCount, setExpectedLessonCount] = useState<number>(lessonCount)
// After
const [expectedLessonCount, setExpectedLessonCount] = useState<number>(5)
```

**Line 114** — `handleGenerate` reset:
```typescript
// Before
setExpectedLessonCount(lessonCount)
// After
setExpectedLessonCount(5)
```

**Line 150** — curate API body:
```typescript
// Before
body: JSON.stringify({ posts, lessonCount }),
// After
body: JSON.stringify({ posts, lessonCount: 5 }),
```

**Line 266** — `handleStartOver` reset:
```typescript
// Before
setExpectedLessonCount(lessonCount)
// After
setExpectedLessonCount(5)
```

**Line 373** — feature badge ternary:
```typescript
// Before
<span>{lessonCount === 5 ? '3–5' : lessonCount} emails per course</span>
// After
<span>3–5 emails per course</span>
```

### Acceptance criteria
- [ ] No `lessonCount` references in the component
- [ ] `ALLOWED_LESSON_COUNTS` not imported
- [ ] `LessonCount` type not imported
- [ ] Feature badge is the literal string `"3–5 emails per course"`
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)

---

## Fix 2 — URL input placeholder (todo 023)

**File:** `src/components/features/ReviewForm.tsx:336`

```typescript
// Before
placeholder="yourname.substack.com"
// After
placeholder="https://yourname.substack.com"
```

### Acceptance criteria
- [ ] Placeholder includes `https://` scheme
- [ ] Consistent format with example button URLs

---

## Fix 3 — Submit button disabled state (todo 024)

**File:** `src/components/features/ReviewForm.tsx:340–342`

```tsx
// Before
<button
  type="submit"
  className="inline-flex items-center gap-2 rounded-lg bg-gray-500 hover:bg-gray-600 px-5 py-3 text-sm font-medium text-white transition-colors"
>

// After
<button
  type="submit"
  disabled={!url || step !== 'input'}
  className="inline-flex items-center gap-2 rounded-lg bg-gray-500 hover:bg-gray-600 px-5 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
```

### Acceptance criteria
- [ ] Button is visually dimmed (`opacity-50`) when URL field is empty
- [ ] Button is visually dimmed and non-interactive when `step !== 'input'`
- [ ] Screen readers receive `disabled` attribute
- [ ] Clicking while disabled does not invoke `handleGenerate`

---

## Fix 4 — Lesson count comparison (todo 025, depends on Fix 1)

**File:** `src/components/features/ReviewForm.tsx:445–448`

Must be applied after Fix 1 — `lessonCount` will be gone.

```tsx
// Before
{lessons.length < lessonCount && (
  <p className="text-sm text-amber-600">
    Only {lessons.length} suitable public post{lessons.length !== 1 ? 's' : ''} found — course is shorter than {lessonCount} lessons.
  </p>
)}

// After
{lessons.length < expectedLessonCount && (
  <p className="text-sm text-amber-600">
    Only {lessons.length} suitable public post{lessons.length !== 1 ? 's' : ''} found — course is shorter than expected.
  </p>
)}
```

### Acceptance criteria
- [ ] No false warning when AI returns exactly the number of lessons it selected (`lessons.length === expectedLessonCount`)
- [ ] Warning appears when `lessons.length < expectedLessonCount` (partial generation)
- [ ] Warning text says "shorter than expected" (not "shorter than 5 lessons")

---

## Fix 5 — SessionStorage QuotaExceededError (todo 029)

**File:** `src/components/features/ReviewForm.tsx:26–30, 47–53`

### Part A — `writeSessionMeta` (line 26)

```typescript
// Before
function writeSessionMeta(meta: CourseMeta) {
  try {
    sessionStorage.setItem(SESSION_META_KEY, JSON.stringify(meta))
  } catch {}
}

// After
function writeSessionMeta(meta: CourseMeta) {
  try {
    sessionStorage.setItem(SESSION_META_KEY, JSON.stringify(meta))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[substack2eec] sessionStorage quota exceeded — course meta will not be saved')
    }
  }
}
```

### Part B — `writeSessionLessons` (line 47)

```typescript
// Before
function writeSessionLessons(lessons: GeneratedLesson[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(lessons))
  } catch {
    // sessionStorage not available (SSR guard)
  }
}

// After
function writeSessionLessons(lessons: GeneratedLesson[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(lessons))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[substack2eec] sessionStorage quota exceeded — lesson progress will not be saved on refresh')
    }
    // Silently ignore other errors (SSR environment, private mode, etc.)
  }
}
```

**Note on user-visible warning:** The minimum acceptance criteria is a `console.warn`. A non-blocking yellow banner would require threading a `storageWarning` state from these module-level functions into the component. For this fix, `console.warn` satisfies the merge requirement. A follow-up can add the UI banner if needed.

### Acceptance criteria
- [ ] `writeSessionLessons` logs `console.warn` when `QuotaExceededError` is thrown
- [ ] `writeSessionMeta` logs `console.warn` when `QuotaExceededError` is thrown
- [ ] SSR-guard behaviour (non-`QuotaExceededError` exceptions) is still silently ignored
- [ ] Normal-case writes (under quota) are unchanged

---

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx` — all 5 fixes (~20 lines changed)

**No changes to:**
- `src/types/index.ts` — `LessonCount` and `ALLOWED_LESSON_COUNTS` still exported (used by `/api/curate/route.ts`)
- `src/app/api/curate/route.ts` — still receives `lessonCount: 5` in request body; no contract change
- Any other file

**Execution order matters:**
- Fix 4 must follow Fix 1 (both reference `lessonCount`)
- All other fixes are independent

---

## Acceptance Criteria (Consolidated)

- [ ] `lessonCount` state and its setter are removed; `ALLOWED_LESSON_COUNTS` / `LessonCount` imports removed
- [ ] URL placeholder includes `https://` scheme
- [ ] Submit button has `disabled` attribute and visual state when inactive
- [ ] Lesson count warning uses `expectedLessonCount` as the baseline
- [ ] `QuotaExceededError` is identified and logged (not silently swallowed)
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] All todo files renamed `pending` → `complete` after fixes are verified

---

## Dependencies & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Fix 4 applied before Fix 1 — `lessonCount` still referenced | Low | Apply in order: 015 → 023 → 024 → 025 → 029 |
| `lessonCount: 5` hardcoded in curate fetch body — breaks if API changes | Very Low | No API change; `5` is the same value as the removed default |
| `disabled` button blocks keyboard shortcut submission | None | Standard HTML behaviour; form keyboard submit still fires `onSubmit` |
| `QuotaExceededError` name differs across browsers | Low | `err.name === 'QuotaExceededError'` is the WHATWG-specified name; all major browsers use it |

---

## Sources & References

- `todos/015-pending-p2-lessoncount-dead-state-and-selector-missing.md`
- `todos/023-pending-p2-url-input-placeholder-scheme-mismatch.md`
- `todos/024-pending-p2-submit-button-missing-disabled-state.md`
- `todos/025-pending-p2-review-step-lesson-count-wrong-comparison.md`
- `todos/029-pending-p2-sessionstorage-quota-exceeded-silent-data-loss.md`
- Related PR: ErnieAtLYD/substack2eec#3
