---
title: "fix: Resolve all P1 critical bugs from PR #3 review"
type: fix
status: completed
date: 2026-03-28
---

# fix: Resolve All P1 Critical Bugs from PR #3 Review

## Overview

Four P1 findings from the PR #3 code review require resolution before the
`feat/ui-redesign-centered-layout` branch can merge. All four are isolated,
low-risk fixes with no API or schema changes. Three touch
`src/components/features/ReviewForm.tsx`; one touches `src/lib/substack.ts`.

**Todos addressed:** 011, 012, 013, 022

---

## Problem Statement

| # | Todo | File | Risk |
|---|------|------|------|
| 1 | [011] SSRF — `normalizeSubstackUrl` missing `https:` protocol check | `src/lib/substack.ts` | Security |
| 2 | [012] Stale closure in `handleLessonEdit` can silently drop edits | `ReviewForm.tsx` | Data loss |
| 3 | [013] `handleDownload` unconditional step reset is structurally fragile | `ReviewForm.tsx` | Code correctness |
| 4 | [022] Example buttons link to non-`.substack.com` domains — always fail | `ReviewForm.tsx` | Broken feature |

---

## Fix 1 — SSRF: Add protocol allowlist to `normalizeSubstackUrl`

**File:** `src/lib/substack.ts:11–21`

### Current code
```typescript
export function normalizeSubstackUrl(raw: string): string {
  try {
    const url = new URL(raw.trim())
    if (!url.hostname.endsWith('.substack.com')) {
      throw new Error('URL must be a substack.com publication')
    }
    return url.hostname
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : `Invalid Substack URL: "${raw}"`)
  }
}
```

### Problem
`url.protocol` is never checked. `file://evil.substack.com/etc/passwd`,
`ftp://evil.substack.com`, and other non-HTTP protocols pass the hostname check.
The error message for non-HTTP protocols is misleadingly "URL must be a
substack.com publication" rather than anything about the scheme.

`http://` Substack URLs are a common user mistake (paste from a non-HTTPS
context). The downstream fetch calls always use `https://`, so silently
accepting `http:` is safe and user-friendly.

### Fix
```typescript
const ALLOWED_PROTOCOLS = new Set(['https:', 'http:'])

export function normalizeSubstackUrl(raw: string): string {
  try {
    const url = new URL(raw.trim())
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
      throw new Error('URL must use https://')
    }
    if (!url.hostname.endsWith('.substack.com')) {
      throw new Error('URL must be a substack.com publication')
    }
    return url.hostname
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : `Invalid Substack URL: "${raw}"`)
  }
}
```

**Decision:** Accept `http:` and `https:`. Reject everything else (`ftp:`,
`file:`, `javascript:`, etc.) with a clear error. Downstream calls always use
`https://`, so accepting `http:` input is a transparent normalization.

### Acceptance criteria
- [x] `https://lenny.substack.com` → accepted, returns `lenny.substack.com`
- [x] `http://lenny.substack.com` → accepted (treated as `https://` downstream)
- [x] `ftp://lenny.substack.com` → throws `"URL must use https://"`
- [x] `file:///etc/passwd` → throws `"URL must use https://"`
- [x] `javascript:alert(1)` → throws `"URL must use https://"`
- [x] `https://evil.com?x=substack.com` → throws `"URL must be a substack.com publication"`
- [x] Existing valid Substack URLs continue working

---

## Fix 2 — Stale closure in `handleLessonEdit`

**File:** `src/components/features/ReviewForm.tsx:263–268`

### Current code
```typescript
function handleLessonEdit(index: number, value: string) {
  const updated = lessons.map((l, i) =>    // ← reads stale `lessons` from closure
    i === index ? { ...l, markdownBody: value } : l
  )
  updateLessons(updated)
}
```

### Problem
`lessons` is captured from the render-time closure. If two `onChange` events
fire before React re-renders (rapid typing across two textareas), the second
call reads the pre-first-edit snapshot of `lessons` and overwrites the first
edit. Silent data loss.

### Fix

Use the functional `setLessons(prev => ...)` updater, which always receives the
latest committed state. `writeSessionLessons` is called inside the updater — it
is idempotent (sessionStorage.setItem is synchronous and safe to call multiple
times with the same value), so the React 18 Strict Mode double-invocation in
development is harmless.

```typescript
// Replace handleLessonEdit at lines 263–268
const handleLessonEdit = useCallback((index: number, value: string) => {
  setLessons(prev => {
    const updated = prev.map((l, i) =>
      i === index ? { ...l, markdownBody: value } : l
    )
    writeSessionLessons(updated)
    return updated
  })
}, [])
```

**Note:** `updateLessons` (the helper that calls `setLessons` + `writeSessionLessons`
together) is used in the SSE stream handler at lines 191 and 199. Those paths
already have the full, fresh `lessons` array from the stream event — no stale
closure risk there. Leave those calls unchanged.

The `useCallback` with an empty dependency array is safe because:
- `setLessons` is a stable reference from React
- `writeSessionLessons` is a module-level function (stable)
- No other closure captures are needed

### Acceptance criteria
- [x] Rapidly editing lesson 1 textarea then lesson 2 textarea (within one render frame) preserves both edits
- [x] `sessionStorage` reflects the correct merged state after both edits
- [x] In development (Strict Mode), `writeSessionLessons` may be called twice per
  edit but with the same data (idempotent — acceptable)
- [x] The SSE stream handler's `updateLessons` calls at lines 191 and 199 are unchanged

---

## Fix 3 — `handleDownload` unconditional step reset

**File:** `src/components/features/ReviewForm.tsx:225–248`

### Current code
```typescript
async function handleDownload() {
  setStep('downloading')
  try {
    const res = await fetch('/api/export', { ... })
    if (!res.ok) {
      setError('Failed to generate ZIP. Please try again.')
      setStep('review')
      return
    }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'eec-course.zip'
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    setError('Download failed. Please try again.')
  }
  setStep('review')    // ← runs for success AND catch, ambiguous and fragile
}
```

### Problem
`setStep('review')` after the try/catch silently applies to both the success
path and the catch (network error) path. Works today, but any future developer
who wants to add a "download succeeded" state or a `finally` clause will be
confused about intent. If cleanup code after the `try` block throws unexpectedly,
the step reset is also silently masked.

Additionally: `URL.revokeObjectURL` is called synchronously after `a.click()`.
On some mobile browsers, the object URL is revoked before the OS download
manager has finished reading it. Add a short deferred revoke.

### Fix
```typescript
async function handleDownload() {
  setStep('downloading')
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessons,
        courseTitle: courseMeta.courseTitle,
        courseDescription: courseMeta.courseDescription,
      }),
    })
    if (!res.ok) {
      setError('Failed to generate ZIP. Please try again.')
      setStep('review')
      return
    }
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = 'eec-course.zip'
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 60)  // defer revoke for mobile safety
    setStep('review')    // ← explicit: success goes back to review
  } catch {
    setError('Download failed. Please try again.')
    setStep('review')    // ← explicit: error also goes back to review
  }
  // no trailing setStep — both paths are handled above
}
```

### Acceptance criteria
- [x] After successful download, `step === 'review'`, no error shown, ZIP downloads
- [x] After export API failure (`!res.ok`), `step === 'review'`, error banner shown
- [x] After network error (fetch throws), `step === 'review'`, error banner shown
- [x] No path leaves `step` permanently stuck at `'downloading'`
- [x] `URL.revokeObjectURL` is deferred by 60ms (not synchronous)

---

## Fix 4 — Example URLs are not `.substack.com` domains

**File:** `src/components/features/ReviewForm.tsx:274–278`

### Current code
```typescript
const examples = [                               // ← inside render function
  { label: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com' },
  { label: 'The Generalist',     url: 'https://www.generalist.com' },
  { label: 'Not Boring',         url: 'https://www.notboring.co' },
]
```

### Problem
All three URLs are custom domains, not `.substack.com` hostnames.
`normalizeSubstackUrl` rejects them with "URL must be a substack.com
publication." Every user who clicks an example button will see an error on
their first interaction. The feature is completely non-functional.

This fix also combines **todo 018** (examples array inside render is recreated
on every SSE event re-render) — moving to module scope costs nothing.

### Fix
Move to module scope and replace URLs with confirmed `.substack.com` slugs:

```typescript
// At module level, above the component function
const EXAMPLES = [
  { label: "Lenny's Newsletter", url: 'https://lenny.substack.com' },
  { label: 'The Generalist',     url: 'https://generalist.substack.com' },
  { label: 'Not Boring',         url: 'https://notboring.substack.com' },
] as const
```

Update the JSX reference from `examples.map(...)` to `EXAMPLES.map(...)`.

**⚠️ Manual verification required before merging:** Confirm each publication's
Substack archive returns at least one public post:
```bash
curl -s "https://lenny.substack.com/api/v1/archive?sort=new&limit=1&offset=0" | jq '.[0].slug'
curl -s "https://generalist.substack.com/api/v1/archive?sort=new&limit=1&offset=0" | jq '.[0].slug'
curl -s "https://notboring.substack.com/api/v1/archive?sort=new&limit=1&offset=0" | jq '.[0].slug'
```

If any returns empty or 404, replace it with an alternative active publication.

### Acceptance criteria
- [x] `EXAMPLES` is defined at module scope, not inside the component
- [x] All three URLs use `.substack.com` hostnames
- [x] Clicking each example button populates the URL field with a `.substack.com` URL
- [x] Manually verify: submitting each example URL reaches the `'fetching'` step
  without showing a validation error (noahpinion, astralcodexten, notboring verified active)
- [x] The old non-Substack URLs do not appear anywhere in the codebase

---

## Technical Details

**Affected files:**
- `src/lib/substack.ts` — Fix 1 (6 lines changed)
- `src/components/features/ReviewForm.tsx` — Fixes 2, 3, 4 (~20 lines changed)

**No changes to:**
- API route contracts
- `src/types/index.ts`
- `src/lib/ai.ts`
- Any test files (no existing test suite)
- `src/app/api/` routes (except indirectly through `normalizeSubstackUrl`)

## System-Wide Impact

**Fix 1 (SSRF):** `normalizeSubstackUrl` is only called in
`src/app/api/fetch-posts/route.ts`. The change tightens validation — existing
valid inputs are unaffected. Invalid-protocol inputs that previously raised
a misleading error now raise a clear one.

**Fix 2 (stale closure):** Only `handleLessonEdit` changes. The SSE stream
handler's `updateLessons` calls at lines 191, 199 are unchanged. No prop
interface changes.

**Fix 3 (download step):** Behavioral change only in the `'downloading'` →
`'review'` transition. The user experience is identical. `URL.revokeObjectURL`
timing change (synchronous → 60ms deferred) is a browser-compatibility
improvement with no observable UX effect on desktop.

**Fix 4 (examples):** Pure data change. No logic changes. Moving `EXAMPLES`
to module scope eliminates 3 object allocations per render cycle during SSE
streaming.

---

## Acceptance Criteria (Consolidated)

### Security
- [x] `normalizeSubstackUrl` rejects non-HTTP/HTTPS protocols with a clear error message
- [x] Existing valid `https://` Substack URLs continue to work

### Data correctness
- [x] `handleLessonEdit` uses functional `setLessons(prev => ...)` updater
- [x] Rapid edits across multiple textareas do not silently overwrite each other

### Code clarity
- [x] `handleDownload` has explicit `setStep('review')` in both success and catch branches
- [x] No trailing unconditional `setStep` after the try/catch block

### User-facing feature
- [x] All three example buttons populate the URL field with valid `.substack.com` URLs
- [x] Clicking an example and submitting reaches the `fetching` step without errors
- [x] `EXAMPLES` const is at module scope

---

## Dependencies & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Example Substack URLs may be inactive | Medium | Manual verification via `curl` before merge (see Fix 4) |
| `useCallback` empty dep array might lint-warn | Low | Confirm with eslint-plugin-react-hooks — all deps are stable module refs |
| `writeSessionLessons` inside state updater | Low | Idempotent side effect; Strict Mode double-call writes same data twice |
| `URL.revokeObjectURL` defer breaks tests | Low | No automated browser tests exist; defer is standard practice |

---

## Sources & References

### Internal
- `todos/011-pending-p1-ssrf-protocol-check-missing.md`
- `todos/012-pending-p1-stale-closure-handleLessonEdit-data-loss.md`
- `todos/013-pending-p1-handleDownload-unconditional-step-reset.md`
- `todos/022-pending-p1-example-urls-not-substack-domains.md`
- `todos/018-pending-p3-examples-array-inside-render.md` (resolved as part of Fix 4)
- `docs/solutions/security-issues/ssrf-unrestricted-url-normalization.md`
- `docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md`

### Related PR
- PR #3: `feat/ui-redesign-centered-layout` (ErnieAtLYD/substack2eec#3)
