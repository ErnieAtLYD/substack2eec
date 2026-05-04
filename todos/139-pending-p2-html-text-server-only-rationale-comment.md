---
status: pending
priority: p2
issue_id: "139"
tags: [code-review, documentation, server-only, convention]
dependencies: []
---

# `src/lib/html-text.ts` Needs Comment Explaining Why It Omits `'server-only'`

## Problem Statement

CLAUDE.md states "All `src/lib/` files must `import 'server-only'` — they contain secrets." The new `src/lib/html-text.ts` deliberately omits this import because it's a pure cheerio-based HTML→text helper consumed by both Next.js server code AND the standalone `spike/extract.ts` tsx Node script. Without an explicit comment, a future contributor mechanically applying the convention will add the import. It would not actually break the spike (the `server-only` package's CommonJS entry is a no-op outside an RSC context), but the convention-violation reasoning would be lost — and a contributor unsure whether the spike runs through the Next bundler might "fix" it the other direction (move the helper somewhere `server-only` is mandatory and re-duplicate it).

## Findings

**Location:** `src/lib/html-text.ts:1`

Both kieran-typescript-reviewer (P2) and security-sentinel (P3, elevated) flagged this. Security clarified: blast radius if a client component ever imported it would be ~600 KB of cheerio shipped to the browser — a perf/bundle regression, not a confidentiality leak. So the rule violation is acceptable, but the rationale must be written down.

## Proposed Solutions

### Option A: Two-line header comment

```ts
// Cross-runtime helper: shared between Next.js server code (`src/lib/substack.ts`)
// and the standalone `spike/extract.ts` tsx script. No 'server-only' import:
// the file contains no secrets, and the spike runs under plain Node.
import { load } from 'cheerio'
```

- Pros: Documents intent inline where future contributors will see it.
- Cons: Comments rot; if the file ever does pick up secrets the comment becomes a bug magnet.
- Effort: Small.

### Option B: Add an ESLint rule allowlist for this file

- Pros: Machine-enforced.
- Cons: We don't have an ESLint rule that mandates `server-only` today; building one for a single exception is overkill.
- Effort: Medium.

## Recommended Action

_Pending triage._ Option A is the lighter touch.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`

## Acceptance Criteria

- [ ] Comment at top of file explains why `'server-only'` is intentionally absent
- [ ] Comment mentions both consumers (Next runtime and spike script)

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- `CLAUDE.md` — "All `src/lib/` files must `import 'server-only'`" rule
- `spike/extract.ts` — second consumer of the helper
