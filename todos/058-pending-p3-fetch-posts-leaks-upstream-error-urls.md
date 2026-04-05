---
status: pending
priority: p3
issue_id: "058"
tags: [code-review, security, error-handling]
dependencies: []
---

# `/api/fetch-posts` Leaks Internal API URL Structure in Error Messages

## Problem Statement

`src/app/api/fetch-posts/route.ts` passes raw `err.message` from `fetchPublicPosts` directly to the client. Errors from `fetchPublicPosts` include internal details like full API paths and retry counts:
- `'Archive fetch failed: HTTP 403'` — leaks HTTP status
- `'Post fetch failed: HTTP 404 for slug "some-slug"'` — leaks slug enumeration
- `'Request failed after 3 retries: https://...'` — leaks full internal URL including path structure (`/api/v1/archive?sort=new&limit=25&offset=0`)

The curate route was hardened with error sanitization (todo 004), but fetch-posts was not.

## Findings

**Location:** `src/app/api/fetch-posts/route.ts` — error handler

The route passes `err.message` from `normalizeSubstackUrl` (acceptable — echoes user input) and from `fetchPublicPosts` (problematic — exposes internal implementation).

## Proposed Solution

Map `fetchPublicPosts` errors to user-facing messages server-side:
```typescript
} catch (err) {
  console.error('[fetch-posts] error:', err)

  if (err instanceof Error) {
    // Pass through URL validation errors (they only echo user input)
    if (err.message.startsWith('URL must') || err.message.startsWith('Invalid Substack URL')) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    // Map internal errors to safe messages
    if (err.message.includes('publication not found')) {
      return NextResponse.json({ error: 'Substack publication not found. Check the URL and try again.' }, { status: 404 })
    }
    if (err.message.includes('No public posts')) {
      return NextResponse.json({ error: 'No public posts found for this publication.' }, { status: 422 })
    }
    if (err.message.includes('rate-limited') || err.message.includes('429')) {
      return NextResponse.json({ error: 'Substack is temporarily rate-limiting requests. Please try again in a minute.' }, { status: 503 })
    }
  }
  return NextResponse.json({ error: 'Failed to fetch posts. Please try again.' }, { status: 500 })
}
```

## Technical Details

**Affected file:** `src/app/api/fetch-posts/route.ts`

## Acceptance Criteria

- [ ] Internal API paths, URLs, and retry counts are not returned to clients
- [ ] User-facing error messages are helpful without being revealing

## Work Log

- 2026-03-29: Found during security review of batch fixes (round 2)
