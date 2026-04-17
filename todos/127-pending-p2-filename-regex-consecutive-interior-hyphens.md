---
status: pending
priority: p2
issue_id: "127"
tags: [code-review, zod, validation, correctness]
dependencies: [117]
---

# Filename Regex Still Permits Consecutive Interior Hyphens (`a--b.md`)

## Problem Statement

Todo 117 (trailing/consecutive hyphens) was partially addressed: the new regex `/^[a-z0-9][a-z0-9-]*[a-z0-9]\.md$/` correctly rejects trailing hyphens (`ab-.md`) by requiring an alphanumeric end-anchor. However, it still accepts consecutive interior hyphens (`lesson--01.md`, `a--b.md`) because `[a-z0-9-]*` allows any sequence including `--`.

Todo 117's acceptance criteria explicitly requires `a--b.md` to be rejected. The current code does not satisfy that criterion.

## Findings

**Location:** `src/types/index.ts:53`

Current regex:
```ts
filename: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]\.md$/).max(80),
```

Passes validation (should fail):
- `lesson--01-test.md` — consecutive hyphens in interior
- `a--b.md`
- `x-y--z-w.md`

Fails validation (correctly):
- `ab-.md` — trailing hyphen ✓
- `a.md` — single char stem ✓
- `lesson-01-getting-started.md` — accepted ✓

The todo 117 file documents Option B (negative lookahead for consecutive hyphens) but the implemented Option A only addresses trailing hyphens.

## Proposed Solutions

### Option A: Add negative lookahead for consecutive hyphens
```ts
filename: z.string().regex(/^[a-z0-9]([a-z0-9]|-(?!-))*[a-z0-9]\.md$/).max(80),
```
- `(-(?!-))` matches a single hyphen not followed by another hyphen
- Rejects `a--b.md` while accepting `a-b.md`
- Pros: Precise, addresses both trailing and consecutive hyphen cases
- Cons: More complex regex

### Option B: Accept consecutive hyphens — close todo 117 as "trailing only"
- Update todo 117 acceptance criteria to remove `a--b.md` rejection requirement
- Document that consecutive hyphens are permitted as they never appear in AI output
- Pros: No code change
- Cons: Contract looser than originally claimed

### Option C: Strip consecutive hyphens in the producer instead
In `parseLessonMarkdown`:
```ts
const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').slice(0, 40)...
```
- Normalizes at generation time so the schema doesn't need to reject them
- Pros: Cleaner data at source
- Cons: Doesn't protect against external API callers

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/types/index.ts:53`
- **Effort:** Small

## Acceptance Criteria

- [ ] `a--b.md` is rejected by `GeneratedLessonSchema`
- [ ] `lesson--01-test.md` is rejected by `GeneratedLessonSchema`
- [ ] `lesson-01-getting-started.md` continues to be accepted
- [ ] `a-b.md` (single interior hyphen) continues to be accepted

## Work Log

- 2026-04-16: Identified by TypeScript reviewer during code review of `fix/export-todos-117-125`. Note: todo 117 acceptance criteria listed `a--b.md` rejection as required but the implementation does not satisfy it.
