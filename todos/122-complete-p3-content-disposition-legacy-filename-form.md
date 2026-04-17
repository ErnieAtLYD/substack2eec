---
status: complete
priority: p3
issue_id: "122"
tags: [code-review, security, headers]
dependencies: []
---

# `Content-Disposition` Uses Legacy `filename=` Form Instead of RFC 5987 `filename*=`

## Problem Statement

The export route uses `filename="${safeTitle}-eec.zip"` (RFC 2183 legacy form) rather than the RFC 5987 percent-encoded `filename*=UTF-8''...` form. This is safe today because `safeTitle` is guaranteed pure ASCII after slugification, but if the slug logic ever changes to allow non-ASCII characters, the header would be malformed and could be interpreted differently across browsers.

## Findings

**Location:** `src/app/api/export/route.ts:46`

```ts
'Content-Disposition': `attachment; filename="${safeTitle}-eec.zip"`,
```

`safeTitle` is post-sanitization `[a-z0-9-]*` — pure ASCII, no injection vector. The technical gap: RFC 5987 `filename*=` is the modern, encoding-safe form that handles Unicode filenames correctly. The current form is browser-compatible for ASCII filenames.

## Proposed Solutions

### Option A: Add `filename*=` alongside `filename=` for modern clients
```ts
'Content-Disposition': `attachment; filename="${safeTitle}-eec.zip"; filename*=UTF-8''${encodeURIComponent(safeTitle)}-eec.zip`,
```
- Modern browsers prefer `filename*=` when both are present
- Fallback `filename=` for older clients
- Pros: Forward-safe, RFC 6266 compliant
- Cons: More verbose, overkill for an ASCII-only slug

### Option B: Keep as-is with a comment noting the ASCII-only constraint
```ts
// safeTitle is guaranteed ASCII-only after slugification — legacy filename= is safe
'Content-Disposition': `attachment; filename="${safeTitle}-eec.zip"`,
```
- Documents the implicit constraint to prevent future breakage
- Pros: No code change needed
- Cons: Future slug changes could break this silently

### Option C: Do nothing (currently safe, purely theoretical concern)

## Recommended Action

_Leave blank for triage_

## Technical Details

- **Files affected:** `src/app/api/export/route.ts:46`
- **Effort:** Small

## Work Log

- 2026-04-16: Identified by security sentinel during code review of PR `fix/export-edge-cases-060-061-062`
