---
status: pending
priority: p3
issue_id: "178"
tags: [code-review, security, dos, memory]
dependencies: []
---

# No Size Cap On `body_html` Before `cheerio.load()` — Multi-MB Substack Response Could OOM A Function Instance

## Problem Statement

`extractTextFromHtml` calls `cheerio.load(html)` with no length guard. `src/lib/substack.ts:81` passes Substack's `post.body_html` straight in. Substack has been known to return multi-MB HTML for posts with embedded base64 images or large preview JSON. A pathological post (or a compromised Substack response) could push a Vercel Function past its memory limit (1-3 GB depending on plan) — OOM kills the worker mid-request.

Not exploitable by the API caller (they don't supply `body_html` directly), but a real availability concern.

Flagged by security-sentinel (P3).

## Findings

**Location:** `src/lib/html-text.ts:24` (`cheerio.load`); `src/lib/substack.ts` (`fetchFullPost` callsite — no size check on the response).

## Proposed Solutions

### Option A: Cap body_html size before extraction (recommended)

```ts
// src/lib/substack.ts
export async function fetchFullPost(pub: string, slug: string) {
  const res = await fetchWithRetry(`https://${pub}/api/v1/posts/${slug}`)
  const post = await res.json()
  if (typeof post.body_html === 'string' && post.body_html.length > 1_000_000) {
    post.body_html = post.body_html.slice(0, 1_000_000)
  }
  return post
}
```

1MB ceiling is generous (typical Substack post HTML is 20-200KB) and well under Function memory limits.

- Pros: Bounds memory before parsing. Cheap.
- Cons: Truncates mid-tag → cheerio handles malformed HTML gracefully but extraction may lose the tail.
- Effort: Trivial.

### Option B: Reject responses over size threshold

Return an error from `fetchFullPost`; surface as a fetch-posts error.

- Pros: Loud failure rather than silent truncation.
- Cons: Worse UX; one bad post breaks the batch.
- Effort: Small.

### Option C: Use a streaming HTML parser instead of cheerio

- Pros: Constant memory.
- Cons: Major rewrite; cheerio's selector API is doing real work.
- Effort: Large.

## Recommended Action

_Pending triage._ Option A. The 1MB cap is operationally invisible to normal traffic and bounds the worst case.

## Technical Details

**Affected files:**
- `src/lib/substack.ts` (`fetchFullPost`)

## Acceptance Criteria

- [ ] `body_html.length` is bounded before `cheerio.load()` runs
- [ ] Pathological 5MB response does not OOM the function

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/lib/substack.ts` (`fetchFullPost`)
- `src/lib/html-text.ts:24`
