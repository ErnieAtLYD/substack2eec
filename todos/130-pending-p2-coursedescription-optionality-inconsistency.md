---
status: pending
priority: p2
issue_id: "130"
tags: [code-review, api-contract, documentation]
dependencies: [129]
---

# `courseDescription` Optionality Inconsistent Across Schema, Interface, and CLAUDE.md

## Problem Statement

After this PR, `courseDescription` is optional at the wire level (schema has `.default('')`) but documented as required in CLAUDE.md and declared as required in the `ExportRequest` interface. Agents following the documented contract will always supply it, but an agent that omits it will silently get an empty README description instead of a 400 that signals the omission. The three sources of truth disagree.

## Findings

**Locations:**

1. `src/app/api/export/route.ts:9` — Zod schema: `courseDescription: z.string().max(1000).default('')` → **optional with default**
2. `src/types/index.ts:89` — Interface: `courseDescription: string` → **required**
3. `CLAUDE.md` — API docs: `{ lessons, courseTitle, courseDescription }` → **required (no `?`)**

An agent omitting `courseDescription`:
- Gets `courseDescription = ''` silently
- ZIP README has a blank description line
- No 400, no signal that a field was missing

This is a documentation and contract clarity gap, not a runtime crash — but it makes the API harder to reason about for agent consumers.

## Proposed Solutions

### Option A: Remove `.default('')` — keep `courseDescription` required (Recommended if description is always available)
```ts
courseDescription: z.string().max(1000),
```
- Agents always have `courseDescription` from the `selection` SSE event
- A missing field correctly returns 400, not silent empty string
- Pros: Consistent with interface and CLAUDE.md; stronger contract
- Cons: Any agent that omits it gets a 400 (intended behavior)

### Option B: Update interface and CLAUDE.md to reflect optional status
```ts
// src/types/index.ts — after deleting ExportRequest (see todo 129)
// CLAUDE.md update:
courseDescription?: string  // optional; defaults to ''
```
- Documents that omission is acceptable
- Pros: Schema and docs agree
- Cons: Weaker contract than "description is always provided"

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/app/api/export/route.ts:9`, `src/types/index.ts:89`, `CLAUDE.md`
- **Effort:** Small
- **Dependencies:** Resolve todo 129 (`ExportRequest` interface deletion) first

## Acceptance Criteria

- [ ] `courseDescription` optionality is consistent across schema, interface (or derived type), and CLAUDE.md
- [ ] If kept required: omitting `courseDescription` returns 400
- [ ] If kept optional: CLAUDE.md documents `// defaults to ''`

## Work Log

- 2026-04-16: Identified by agent-native reviewer and code simplicity reviewer during code review of `fix/export-todos-117-125`
