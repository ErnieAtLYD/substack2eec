---
status: complete
priority: p1
issue_id: "011"
tags: [code-review, security, ssrf]
dependencies: []
---

# SSRF: `normalizeSubstackUrl` Does Not Assert `https:` Protocol

## Problem Statement

`normalizeSubstackUrl` only checks `url.hostname.endsWith('.substack.com')` but never asserts `url.protocol === 'https:'`. A URL like `file://evil.substack.com/etc/passwd` passes the check. Additionally, `/api/curate` accepts a `posts` array with arbitrary `bodyHtml` from the client — an attacker can skip `/api/fetch-posts` entirely and inject crafted HTML into the AI pipeline without any URL validation.

**Why it matters:** Pre-existing SSRF surface made more prominent by the redesign adding a clearly visible URL input. Two distinct vectors: scheme bypass and unauthenticated direct-to-curate content injection.

## Findings

**Location 1:** `src/lib/substack.ts` — `normalizeSubstackUrl`

```typescript
if (!url.hostname.endsWith('.substack.com')) {
  throw new Error('URL must be a substack.com publication')
}
// ❌ No protocol check — file://, javascript:// etc. pass
```

**Location 2:** `src/app/api/curate/route.ts` — accepts `posts[].bodyHtml` from client body with no re-validation.

**Known Pattern:** See `docs/solutions/` — previous SSRF fix documented separately.

## Proposed Solutions

### Option A — Protocol + scheme allowlist (Recommended)
Add `url.protocol !== 'https:'` guard immediately after URL parse in `normalizeSubstackUrl`. Add slug format validation and `bodyHtml` length cap in `/api/curate`.
- **Pros:** Closes both vectors, minimal code change
- **Cons:** None
- **Effort:** Small | **Risk:** Low

### Option B — Strip `bodyHtml` from fetch-posts response
Have `/api/fetch-posts` return only `bodyText` (already extracted), and have `/api/curate` never accept raw HTML from the client at all.
- **Pros:** Eliminates the HTML round-trip attack surface entirely
- **Cons:** Larger refactor, changes API contract
- **Effort:** Medium | **Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `src/lib/substack.ts`, `src/app/api/curate/route.ts`
- **Components:** URL normalization, curate route handler

## Acceptance Criteria

- [ ] `normalizeSubstackUrl` rejects non-`https:` URLs with a clear error
- [ ] `/api/curate` validates `post.slug` is alphanumeric and `post.bodyHtml` is length-bounded
- [ ] Existing Substack URLs continue to work correctly

## Work Log

- 2026-03-27: Surfaced by security-sentinel agent during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
- Related: `docs/solutions/` SSRF solution doc
