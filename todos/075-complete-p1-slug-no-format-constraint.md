---
status: pending
priority: p1
issue_id: "075"
tags: [code-review, security, prompt-injection, validation]
dependencies: []
---

# `slug` Fields Have No Format Constraint — Prompt/Filesystem Injection Surface

## Problem Statement

Both route schemas accept `slug: z.string().max(500)` with no format constraint. The slug cross-reference check in `curate/route.ts` forces a lesson slug to match one in the submitted `posts` array — but the `posts` slugs are also client-controlled in the same request. An attacker can submit a post with a malicious slug and pair it with a matching `selectedCourse.lessons[].slug`. The slug passes the cross-reference check, bypasses sanitization (slug is never passed through `sanitizeForPrompt`), and lands in `parseLessonMarkdown` where it contributes to the exported `.md` filename.

The regex in `parseLessonMarkdown` (`/[^a-z0-9-]/g`) does strip injection chars before the filename is written, so the immediate filesystem risk is low. However, the schema imposes no constraint, creating a fragile dependency on every call-site correctly sanitizing slugs. Any future code path that embeds a slug in a prompt (e.g., logging, context blocks) without knowing to sanitize it first would be immediately exploitable.

## Findings

- `src/app/api/curate/route.ts:12` — `slug: z.string().max(500)` (CuratedLessonSchema)
- `src/app/api/curate/route.ts:28` — `slug: z.string().max(500)` (posts array schema)
- `src/app/api/propose-courses/route.ts:12` — `slug: z.string().max(500)` (posts array schema)
- The cross-reference check at `curate/route.ts:76–83` validates slug *exists* in posts but not its *format*
- `sanitizeForPrompt` is never called on slug fields

**Source:** Security sentinel review

## Proposed Solutions

### Option A — Add regex constraint to Zod schema (Recommended)
Add `.regex(/^[a-z0-9][a-z0-9-]*$/).max(100)` to all `slug` fields in both route schemas and `CuratedLessonSchema`.

**Pros:** Eliminates the surface entirely at the boundary. Slugs are alphanumeric by Substack convention anyway.
**Cons:** Requires clients to send valid slugs; legitimate edge cases (slugs with underscores, uppercase) would be rejected.
**Effort:** Small
**Risk:** Low — Substack slugs are already lowercase-alphanumeric-hyphen

### Option B — Sanitize slug before any use
Apply `sanitizeForPrompt` to slug before cross-reference check and before passing to AI functions.

**Pros:** Defense-in-depth without schema change.
**Cons:** sanitizeForPrompt doesn't strip alphanumeric-only — still allows long injections.
**Effort:** Small
**Risk:** Medium — doesn't fully constrain the surface

### Option C — No change; rely on parseLessonMarkdown regex
Keep as-is; the only current code path that uses slug for output is `parseLessonMarkdown` which already strips to `[a-z0-9-]`.

**Pros:** Zero code change.
**Cons:** Future code paths that embed slug elsewhere will silently inherit the injection surface.
**Effort:** None
**Risk:** High — brittle

## Recommended Action

Option A: add `.regex(/^[a-z0-9][a-z0-9-]*$/).max(100)` to all slug fields in both route schemas.

## Technical Details

**Affected files:**
- `src/app/api/curate/route.ts` lines 12, 28
- `src/app/api/propose-courses/route.ts` line 12

## Acceptance Criteria

- [ ] `slug` in `CuratedLessonSchema` has a regex constraint limiting to `[a-z0-9-]`
- [ ] `slug` in the posts array schema in both routes has the same constraint
- [ ] A request with a slug containing `\n` or `<` is rejected with 400

## Work Log

- 2026-04-04: Found by security sentinel code review
