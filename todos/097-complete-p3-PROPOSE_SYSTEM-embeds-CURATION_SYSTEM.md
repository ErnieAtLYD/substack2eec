---
status: pending
priority: p3
issue_id: "097"
tags: [code-review, simplicity, ai, maintainability]
dependencies: []
---

# `PROPOSE_SYSTEM` Embeds `CURATION_SYSTEM` via String Interpolation — Implicit Coupling

## Problem Statement

```ts
const PROPOSE_SYSTEM = `\
${CURATION_SYSTEM}

## Additional requirement for this task
...`
// src/lib/ai.ts:202–211
```

This inheritance pattern creates implicit coupling: any edit to `CURATION_SYSTEM` silently changes `PROPOSE_SYSTEM`. This is defensible today (propose genuinely extends curation), but if the two prompts diverge in the future (e.g., propose needs different formatting instructions), untangling them will be non-obvious.

## Findings

- `src/lib/ai.ts:202` — `${CURATION_SYSTEM}` interpolated into `PROPOSE_SYSTEM`
- No test or comment noting the dependency

**Source:** Simplicity reviewer

## Proposed Solutions

### Option A — Keep as-is, add a comment (Recommended)
```ts
// Note: PROPOSE_SYSTEM extends CURATION_SYSTEM. Edits to CURATION_SYSTEM
// will affect both the curation and proposal prompts.
const PROPOSE_SYSTEM = `${CURATION_SYSTEM} ...`
```

**Effort:** Trivial | **Risk:** None

### Option B — Make PROPOSE_SYSTEM independent
Copy-paste `CURATION_SYSTEM` content into `PROPOSE_SYSTEM` as a standalone string. No interpolation.

**Pros:** No coupling.
**Cons:** Duplication; shared improvements to the base prompt must be applied twice.
**Effort:** Small | **Risk:** Low

## Recommended Action

Option A — the coupling is intentional and appropriate; document it.

## Technical Details

**Affected files:**
- `src/lib/ai.ts:202`

## Acceptance Criteria

- [ ] Comment documents the PROPOSE_SYSTEM → CURATION_SYSTEM dependency

## Work Log

- 2026-04-04: Found by simplicity reviewer
