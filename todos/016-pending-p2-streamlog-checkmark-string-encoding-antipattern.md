---
status: pending
priority: p2
issue_id: "016"
tags: [code-review, quality, anti-pattern, streamlog]
dependencies: []
---

# `streamLog` Uses `✓` String Prefix as Status Signal — Known Anti-Pattern

## Problem Statement

Log entries are written with a `✓ ` prefix to encode "completed" status. The render code then checks `.startsWith('✓')` and strips `.slice(2)` to display the text separately. This is deriving structured state from a display string — the exact anti-pattern documented in `docs/solutions/runtime-errors/streamlog-parsing-source-error.md`.

**Why it matters:** If the log string format changes (e.g., UI text update changes the prefix), the render logic silently breaks — items that should show as complete will render as pending, or vice versa. The SSE event data already carries the ground truth; it should be used directly.

## Findings

**Location:** `src/components/features/ReviewForm.tsx`

Write side (line ~188):
```typescript
setStreamLog(prev => [...prev, `✓ Lesson ${n}: ${title}`])
setStreamLog(prev => [...prev, `Writing lesson ${n}…`])
```

Render side (lines ~412–416):
```typescript
line.startsWith('✓') ? 'text-gray-700' : 'text-gray-400'
line.startsWith('✓') ? <span>✓</span> : <span>·</span>
line.startsWith('✓') ? line.slice(2) : line
```

**Known Pattern:** `docs/solutions/runtime-errors/streamlog-parsing-source-error.md` explicitly documents this as the anti-pattern to avoid. This PR reintroduces it in the redesigned render path.

## Proposed Solutions

### Option A — Typed log entry (Recommended)

```typescript
type LogEntry = { text: string; done: boolean }
const [streamLog, setStreamLog] = useState<LogEntry[]>([])

// Write:
setStreamLog(prev => [...prev, { text: `Lesson ${n}: ${title}`, done: true }])
setStreamLog(prev => [...prev, { text: `Writing lesson ${n}…`, done: false }])

// Render:
{streamLog.map((entry, i) => (
  <li key={i} className={entry.done ? 'text-gray-700' : 'text-gray-400'}>
    <span>{entry.done ? '✓' : '·'}</span>
    <span>{entry.text}</span>
  </li>
))}
```

- **Pros:** Eliminates string parsing, separates display from state
- **Cons:** Minor refactor across all `setStreamLog` call sites
- **Effort:** Small | **Risk:** Low

### Option B — Keep strings, remove render-side parsing

Accept the string format as a stable contract but document it explicitly and validate at write time (only two string patterns are ever written). Lower risk but still fragile.

- **Pros:** Smaller change
- **Cons:** Does not fix the root cause; documentation can go stale
- **Effort:** Very Small | **Risk:** Medium (still fragile)

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `src/components/features/ReviewForm.tsx`
- **Components:** `streamLog` state, SSE event handler, log render list

## Acceptance Criteria

- [ ] `streamLog` entries carry a typed `done: boolean` field (or equivalent)
- [ ] Render code does not call `.startsWith()` or `.slice()` on log strings
- [ ] All existing log write sites updated to use the new type

## Work Log

- 2026-03-27: Surfaced by simplicity reviewer; confirmed as known anti-pattern by learnings-researcher (see `docs/solutions/runtime-errors/streamlog-parsing-source-error.md`)

## Resources

- PR: ErnieAtLYD/substack2eec#3
- Past solution: `docs/solutions/runtime-errors/streamlog-parsing-source-error.md`
