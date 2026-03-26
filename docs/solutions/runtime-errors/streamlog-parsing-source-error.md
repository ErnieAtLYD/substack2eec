---
title: Display String Array Used as Structured State Source
problem_type: logic_error
component: src/components/features/ReviewForm.tsx
symptoms:
  - Progress bar or counter shows wrong value if log message format changes
  - Business logic silently breaks with no type error
  - Structured state derived by filtering/parsing a display string array
tags:
  - react state management
  - separation of concerns
  - sse streaming
  - progress tracking
severity: medium
---

# Display String Array Used as Structured State Source

## Problem

`completedLessonCount` was derived in JSX render by filtering the `streamLog` display array:

```typescript
streamLog.filter(l => l.startsWith('✓ Lesson ')).length
```

`streamLog` exists for display purposes only. Deriving structured state from it couples business logic to UI string formatting — if the prefix changes (`✓` → `✅`, or the message format is refactored), the progress bar and counter silently produce wrong values with no TypeScript error to catch the breakage.

## Root Cause

The SSE `lesson_done` event was already firing with the correct data (`event.lesson`). The fix was straightforward: track completion as proper state incremented from the event, not inferred from log strings.

The IIFE pattern used to define `completedCount` inside JSX was also a symptom — it was necessary because you can't declare a `const` directly in JSX, which is a signal that the variable belongs above the `return` statement.

## Before

```typescript
// In JSX — IIFE to declare a local variable
{step === 'generating' && (() => {
  const completedCount = streamLog.filter(l => l.startsWith('✓ Lesson ')).length
  return (
    <div>
      <span>{completedCount} / {expectedLessonCount} lessons</span>
      <div style={{ width: `${(completedCount / expectedLessonCount) * 100}%` }} />
    </div>
  )
})()}
```

## After

```typescript
// State declared alongside other state
const [completedLessonCount, setCompletedLessonCount] = useState(0)

// Incremented on the SSE event that carries the ground truth
} else if (event.type === 'lesson_done') {
  inProgressLessons.push(event.lesson)
  setCompletedLessonCount(inProgressLessons.length)  // source of truth
  setStreamLog(prev => [...prev, `✓ Lesson ${event.lesson.lessonNumber}: ${event.lesson.title}`])
}

// Reset on new generation and start-over
setCompletedLessonCount(0)

// In JSX — plain state reference, no IIFE needed
{completedLessonCount > 0 && (
  <span>{completedLessonCount} / {expectedLessonCount} lessons</span>
)}
```

## Prevention

**Rule:** Display strings are for display. Never derive counts, status, or structured state from them.

**Signs you have this problem:**
- `someArray.filter(x => x.startsWith('✓'))` in render code
- Parsing emoji prefixes, prefixes, or suffixes to infer state
- An IIFE in JSX to define a "local variable"

**Detection grep:**
```bash
grep -rn "startsWith\|filter" src/components --include="*.tsx" | grep -i "log\|stream\|status"
```

**Correct pattern:**
- SSE/event streams already carry structured data — use it directly as state
- Keep `streamLog` (or equivalent) append-only and display-only
- If you need to know "how many X completed", track that with `useState` incremented at the event handler, not inferred from the log
