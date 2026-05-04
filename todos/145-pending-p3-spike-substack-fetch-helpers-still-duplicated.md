---
status: pending
priority: p3
issue_id: "145"
tags: [code-review, simplicity, follow-up, duplication]
dependencies: []
---

# Follow-up: `fetchWithRetry` / `sleep` / `normalizeSubstackUrl` Still Duplicated Between Spike and `substack.ts`

## Problem Statement

The recent dupes refactor extracted `extractTextFromHtml` into a shared module. But `spike/extract.ts` still duplicates three other helpers from `src/lib/substack.ts`:

- `fetchWithRetry` (`spike/extract.ts:19-33` ↔ `src/lib/substack.ts:36-49`)
- `sleep` (`spike/extract.ts:35-37` ↔ `src/lib/substack.ts:32-34`)
- `normalizeSubstackUrl` (`spike/extract.ts:39-42` ↔ `src/lib/substack.ts:13-26`, simplified version in spike)

`fallow dupes` may flag the retry loop after future strict-mode tuning.

## Findings

**Location:** `spike/extract.ts:19-42` and `src/lib/substack.ts:13-49`

The reason these weren't extracted in the same refactor:
1. `src/lib/substack.ts` imports `'server-only'`. While that wouldn't actually break the spike's tsx Node entry, it would conceptually conflate runtimes.
2. The spike uses a slightly different User-Agent (`spike/1.0` vs `substack2eec/1.0`).
3. The spike's `normalizeSubstackUrl` is a simplified inline version — no protocol/hostname validation.

Flagged P3 by code-simplicity-reviewer as a known follow-up.

## Proposed Solutions

### Option A: Extract a shared `src/lib/substack-http.ts`

Move `fetchWithRetry`, `sleep`, `normalizeSubstackUrl` into a new module without `'server-only'` (matching the html-text.ts pattern). Parameterize the User-Agent.

- Pros: Eliminates remaining dup, mirrors the html-text.ts approach.
- Cons: Same `server-only` policy debate as html-text.ts. Now two non-`server-only` files in `src/lib/`.
- Effort: Medium.

### Option B: Move the spike inside the Next.js test surface

Convert `spike/extract.ts` to a vitest integration test or a Next.js dev script. Then it can import directly from `src/lib/substack.ts` even with `'server-only'` (vitest runs in Node).

- Pros: No new shared module. Spike becomes a real test.
- Cons: Larger scope change; spike is meant to be a quick diagnostic, not a permanent test.
- Effort: Medium.

### Option C: Leave the duplication

- Pros: Spike stays runtime-isolated; documented in CLAUDE.md as a "spike" (throwaway-by-design).
- Cons: The duplication will get re-flagged by future tooling.
- Effort: Zero.

## Recommended Action

_Pending triage._ Option A is most consistent with the html-text.ts pattern.

## Technical Details

**Affected files:**
- `spike/extract.ts`
- `src/lib/substack.ts`
- (potentially new) `src/lib/substack-http.ts`

## Acceptance Criteria

- [ ] If accepted: shared HTTP helpers extracted; spike imports from shared module
- [ ] `npm test` and `tsx spike/extract.ts <url> 2` both work

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor (out-of-scope follow-up).

## Resources

- code-simplicity-reviewer flagged this as deferred follow-up
- Related: CLAUDE.md "Spike code" section
