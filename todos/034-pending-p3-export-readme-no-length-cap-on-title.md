---
status: pending
priority: p3
issue_id: "034"
tags: [code-review, security, validation]
dependencies: []
---

# `courseTitle` and `courseDescription` Written to ZIP README Without Length Cap

## Problem Statement

`/api/export` accepts `courseTitle` and `courseDescription` from the client request body and passes them directly to `buildReadme()` → the ZIP's README.md without any server-side length validation. An automated POST to `/api/export` with a multi-megabyte `courseTitle` would cause the server to allocate that memory, embed it in the ZIP, and return a multi-megabyte response.

**Why it matters:** The filename sanitization (`safeTitle = courseTitle.toLowerCase().replace(...)`) happens, but the raw `courseTitle` and `courseDescription` are embedded verbatim in the README content. No input length cap exists for either field.

## Findings

**Location:** `src/lib/export.ts` — `buildReadme` function

```typescript
// courseTitle and courseDescription come directly from the client body
return `# ${courseTitle}\n\n${courseDescription}\n\n...`
```

**Location:** `src/app/api/export/route.ts` — no length validation before calling `buildZip`

The `filename` is capped at 50 chars via `.slice(0, 50)`, but the content (title + description in README) is not capped.

## Proposed Solutions

### Option A: Add length caps in the export route handler (Recommended)
```typescript
// In src/app/api/export/route.ts, before passing to buildZip:
const safeCourseTitle = (body.courseTitle ?? '').slice(0, 200)
const safeCourseDescription = (body.courseDescription ?? '').slice(0, 1000)
```
- **Pros:** Simple, bounded memory allocation, no behavior change for normal usage
- **Effort:** Trivial
- **Risk:** None

### Option B: Validate in `buildZip` / `buildReadme`
- Apply caps closer to usage
- **Cons:** Validation at the wrong layer (should happen at the API boundary)

## Recommended Action

Option A — validate at the API route boundary.

## Technical Details

**Affected files:**
- `src/app/api/export/route.ts` — add length caps
- `src/lib/export.ts` — `buildReadme` (no change needed if route caps inputs)

## Acceptance Criteria

- [ ] `courseTitle` capped at 200 characters in the export route
- [ ] `courseDescription` capped at 1000 characters in the export route
- [ ] Normal-case exports (AI-generated titles/descriptions) are unaffected
- [ ] Oversized inputs are silently truncated (not an error)

## Work Log

- 2026-03-28: Finding from PR #3 security review (security sentinel)

## Resources

- PR #3: `feat/ui-redesign-centered-layout`
- `src/app/api/export/route.ts`
- `src/lib/export.ts` — `buildReadme`
