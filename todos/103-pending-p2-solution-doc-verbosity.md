---
status: pending
priority: p2
issue_id: "103"
tags: [code-review, documentation]
dependencies: ["102"]
---

# Solution Doc Verbosity — Duplicate Test Pattern and Investigation Diary

## Problem Statement

`docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md` is ~18-23% longer than necessary due to two sections that duplicate content available elsewhere:

1. **"Test Pattern: Proving Non-Spoofability" (lines 170-189)** — an abstract version of the concrete test already shown at lines 99-127. It adds no new information and contains errors (see todo 102).
2. **"Investigation Steps" (lines 86-91)** — a 5-step procedural diary that re-describes what `git log` already shows. The only non-obvious detail (bug-first test rule) is already in `CLAUDE.md`.

Together these account for ~27 removable lines (~14% of the document).

## Findings

**Duplicate test pattern:**
Lines 99-127 show the concrete Vitest test, including `vi.resetModules()` isolation and the exact assertion chain. Lines 170-189 show a near-identical abstract version. A reader who understands one understands both.

**Investigation diary:**
```markdown
## Investigation Steps

1. Audited `src/middleware.ts` — found `x-forwarded-for.split(',')[0]` ...
2. Confirmed the attack: ...
3. Verified Vercel header behavior: ...
4. Wrote failing regression tests before changing the source code (project rule).
5. Applied the one-line fix; all 5 tests passed.
```
This is a retelling of the commit history, not reusable knowledge.

## Proposed Solutions

### Option A — Delete both sections (Recommended)

Remove lines 86-91 (Investigation Steps) and lines 170-189 (Test Pattern subsection including its heading). Keep the concrete test block at lines 99-127.

- **Pros:** ~27-line reduction; no information loss; removes error-containing duplicate (see todo 102)
- **Effort:** Small | **Risk:** None

### Option B — Remove Investigation Steps only

Keep the abstract Test Pattern but fix its errors (per todo 102).

- **Effort:** Small | **Risk:** None

## Recommended Action

Option A. The concrete test is the canonical reference; the abstract pattern is noise.

## Technical Details

**Affected file:** `docs/solutions/security-issues/vercel-rate-limiter-xff-ip-spoofing.md`  
Lines to remove: 86-91 (Investigation Steps), 170-189 (Test Pattern subsection)

## Acceptance Criteria

- [ ] "Investigation Steps" section removed
- [ ] "Test Pattern: Proving Non-Spoofability" subsection removed (or retained but with errors from todo 102 fixed)
- [ ] Net document length reduced

## Work Log

- 2026-04-12: Found by code-simplicity-reviewer on PR #7
