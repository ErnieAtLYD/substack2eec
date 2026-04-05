---
status: pending
priority: p3
issue_id: "094"
tags: [code-review, typescript, react, ui]
dependencies: []
---

# Candidate Cards Use `key={i}` (Index Key) — Fragile for Future Refresh Feature

## Problem Statement

```tsx
{candidates.map((candidate, i) => (
  <div key={i} ...>
// src/components/features/ReviewForm.tsx:439
```

The candidates array is static once rendered, so index keys cause no reconciliation bugs today. However, if a future "refresh candidates" feature replaces the array with a new API response, React will reuse existing DOM nodes by index rather than identity. This could preserve stale interaction state (hover, focus) on cards that represent entirely different candidates.

## Findings

- `src/components/features/ReviewForm.tsx:439` — `key={i}`
- `candidates` state is set once and never updated, so this is safe today

**Source:** TypeScript reviewer

## Proposed Solutions

### Option A — Use `candidate.courseTitle` as key
```tsx
key={candidate.courseTitle}
```
Course titles are unique per API contract (3 distinct themes).

**Effort:** Trivial | **Risk:** None

### Option B — Keep index key with a comment
Document why it's safe (static array, no refresh).

**Effort:** Minimal | **Risk:** None for current code, fragile for future code

## Recommended Action

Option A — trivial change, eliminates future footgun.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:439`

## Acceptance Criteria

- [ ] Candidate cards use a stable key derived from content, not array index

## Work Log

- 2026-04-04: Found by TypeScript reviewer
