---
status: complete
priority: p2
issue_id: "117"
tags: [code-review, zod, validation, correctness]
dependencies: []
---

# Filename Regex Permits Trailing and Consecutive Hyphens in the Stem

## Problem Statement

The filename validation regex `/^[a-z0-9][a-z0-9-]+\.md$/` allows malformed filenames like `lesson-.md` (trailing hyphen), `a--b.md` (consecutive hyphens), and `ab-.md` (trailing hyphen before extension). These are technically valid per the current regex but produce poorly-formed filenames in the exported ZIP. The regex change in this PR correctly tightened the minimum length but did not address hyphen placement.

## Findings

**Location:** `src/app/api/export/route.ts:13`

Current regex: `/^[a-z0-9][a-z0-9-]+\.md$/`

Accepted (but malformed):
- `lesson-.md` — trailing hyphen before `.md`
- `a--b.md` — consecutive hyphens
- `ab-.md` — trailing hyphen

These pass Zod validation and would be passed directly to `buildZip` as ZIP entry names.

## Proposed Solutions

### Option A: Require alphanumeric at both ends of stem (Recommended)
```ts
filename: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]\.md$/).max(80)
```
- Requires stem to start AND end with alphanumeric
- Minimum stem length becomes 2 chars (same improvement as the `*` → `+` change)
- Eliminates trailing hyphens and is more readable
- Pros: Clean, readable, enforces common filename convention
- Cons: Rejects 2-char stems where second char is a hyphen (e.g., `a-.md`) — but this was never valid anyway

### Option B: Add explicit no-consecutive-hyphens pattern
```ts
filename: z.string().regex(/^[a-z0-9]([a-z0-9]|-(?!-))*[a-z0-9]\.md$/).max(80)
```
- Disallows consecutive hyphens explicitly via negative lookahead
- Pros: More precise
- Cons: Complex regex, harder to read and maintain

### Option C: Accept current state — AI-generated filenames never have these forms
- The AI produces well-formed slugs like `lesson-01-why-this-matters.md`
- These edge cases are theoretical for this specific application
- Pros: No change needed
- Cons: Validation contract is looser than claimed

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/app/api/export/route.ts:13`
- **Components:** Export route Zod schema

## Acceptance Criteria

- [ ] `lesson-.md` is rejected by the filename validator
- [ ] `a--b.md` is rejected by the filename validator
- [ ] `lesson-01-getting-started.md` continues to be accepted

## Work Log

- 2026-04-16: Identified by TypeScript reviewer during code review of PR `fix/export-edge-cases-060-061-062`
- 2026-04-16 (partial): Trailing-hyphen half resolved when `GeneratedLessonSchema.filename` was tightened to `/^[a-z0-9][a-z0-9-]*[a-z0-9]\.md$/`. Consecutive-hyphen AC remained unsatisfied and was carved into [[127]].
- 2026-05-21: Consecutive-hyphen AC fully resolved together with [[127]]. Schema regex now `/^[a-z0-9]([a-z0-9]|-(?!-))*[a-z0-9]\.md$/` at `src/types/index.ts:69` (negative-lookahead rejects `--`). Producer at `src/lib/ai.ts:486` also collapses runs via `.replace(/-{2,}/g, '-')` so `parseLessonMarkdown` continues to satisfy the schema for AI-emitted slugs containing non-alphanumeric runs. All 3 ACs now satisfied; tests in `src/__tests__/ai-filename.test.ts` cover `a--b.md`, `lesson--01-test.md`, and the normal-slug acceptance case.

## Resources

- PR branch: `fix/export-edge-cases-060-061-062`
- Affected file: `src/app/api/export/route.ts:13`
