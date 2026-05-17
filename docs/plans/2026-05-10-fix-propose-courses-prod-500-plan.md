---
title: Investigate and fix /api/propose-courses returning HTTP 500 in production
type: fix
status: active
date: 2026-05-10
---

# Investigate and fix /api/propose-courses returning HTTP 500 in production

## Reframe of the bug report

User report: "Any Substack URL returns HTTP 500 in production."

Production runtime logs (last 7 days, prod env, status=500) show **all four
500s are on `POST /api/propose-courses`** — none on `/api/fetch-posts` and
none on `/api/curate`. From the user's perspective they pasted a URL and
got a 500, but the failure is one step deeper in the pipeline:
`fetch-posts` succeeds, then `propose-courses` (the auto-curation step)
crashes inside the try/catch at `src/app/api/propose-courses/route.ts:34`.

Implication: do **not** waste cycles changing `fetch-posts` or `substack.ts`.
The bug is in `propose-courses` → `proposeCourseCandidates` (`src/lib/ai.ts:216`)
or in its environment.

## Evidence collected

- **Production deployment:** `dpl_5pYL69RuC7ZuZ3rN47eV7rfKKbPE` (commit `3862771`,
  merged PR #17, target=production, READY).
- **Log sample (4 entries, 2026-05-10, ~18:52–18:54 UTC):** all four are
  `POST /api/propose-courses → 500 error [propose-courses] error: Er…`
  (Vercel log viewer truncates after `Er…`; full message is not visible
  through the MCP log surface).
- **Error origin in code:** `src/app/api/propose-courses/route.ts:34-39`
  — the catch logs `[propose-courses] error: <err>` and returns
  `{ error: 'Failed to generate course candidates. Please try again.' }`
  unless the thrown message starts with `Candidate proposal` (those two
  strings are at `src/lib/ai.ts:244` and `src/lib/ai.ts:256`). The leading
  `Er…` in the log strongly suggests the thrown value is a generic
  `Error(...)` whose message starts with "Error" — most likely an
  Anthropic SDK error or an `AbortError` / `TypeError`, not one of our
  two narrow "Candidate proposal …" throws.

## Hypotheses (ranked)

### H1 — Anthropic API call is failing (highest likelihood)
`proposeCourseCandidates` makes one `messages.create` call against
`MODEL = 'claude-sonnet-4-6'` with `max_tokens: 8192` and a forced
`tool_choice` (`src/lib/ai.ts:234-241`). Any of the following surface as
a thrown `APIError` from `@anthropic-ai/sdk@^0.78.0`:

- Production `ANTHROPIC_API_KEY` is missing, malformed, expired, or
  scoped to a workspace that doesn't have Sonnet 4.6 enabled.
- Account is over its monthly cap or has a billing block (`429`/`402`).
- Anthropic rate-limit (org-level RPM/TPM) on Sonnet 4.6.
- `claude-sonnet-4-6` is not exposed on the API key's tier (the model
  exists, but key entitlement is what matters).
- `max_tokens: 8192` is being rejected for this model+key combo.

If H1 is true, the `Er…` prefix in the log is the SDK's
`Error: <status> <body>` shape.

### H2 — Vercel function timeout
`maxDuration = 60` is set on this route. The propose call is one
non-streaming Anthropic request with up to 8192 output tokens and a
~50-post prompt. Sonnet 4.6 typically returns within 30-45s for that
shape, so this is plausible but secondary. A timeout would surface as
a 504 Gateway Timeout from Vercel — but if the SDK itself throws
`AbortError` first (default fetch timeout), the route's catch turns it
into a 500. Test by checking whether failing requests took close to
60s (Vercel request duration).

### H3 — Tool-use response shape changed under Sonnet 4.6
If the model occasionally returns no `tool_use` block or returns
`stop_reason: 'end_turn'` despite `tool_choice` being forced, we throw
"Claude did not return a tool call for candidate proposal"
(`src/lib/ai.ts:249`) — that thrown message starts with "Claude", not
"Er", so this would not match the truncated log unless wrapped. Lower
likelihood, but worth re-checking against current Anthropic SDK behavior.

### H4 — Request body too large or input-token limit exceeded
50 posts × ~6 fields × ≤300 chars (`MAX_PROMPT_FIELD_LEN`) is bounded;
unlikely to exceed 200K context. Low likelihood unless a Substack
publication has unusually long titles/excerpts that bypass the field
cap (none should, given the slice).

### H5 — Some other unhandled throw inside `proposeCourseCandidates`
`String(c.courseTitle ?? '')` etc. won't throw; the `.filter`/`.map`
pipeline is null-safe. Low likelihood.

## Acceptance criteria

- [ ] Root cause identified with a citation from production logs (full
      stack/message, not the truncated `Er…` prefix).
- [ ] Reproduction documented — either a failing prod URL captured in a
      runtime log entry with full error body, or a local repro using the
      same Anthropic key.
- [ ] Fix applied **and** verified end-to-end against production for the
      same URL the user reported failing on.
- [ ] One of: error is now correctly handled with a user-actionable
      message (e.g., "AI quota exceeded — try again in N minutes") OR
      the underlying call now succeeds.
- [ ] `[propose-courses] error: …` log lines now include enough context
      to triage future occurrences without re-deploying — at minimum,
      log `err.name`, `err.status` (if `APIError`), and the first line
      of the message. Today's `console.error('[propose-courses] error:', err)`
      relies on `Error.toString()` which is what gives us the useless
      `Er…` truncation.

## Implementation plan

### Phase 1 — Get the real error message (no code change yet)

1. **Reproduce in production with a request ID.**
   Open the running prod deployment in the browser, hit `Submit`, capture
   the failing request ID from devtools (the `x-vercel-id` response
   header). Then re-query Vercel logs scoped to that request:

   ```
   mcp get_runtime_logs requestId=<x-vercel-id> environment=production
   ```

   This returns the full multi-line error body that the table view
   truncates.

2. **Check env-var presence and shape in production.**
   Without exposing values: `vercel env ls production` and confirm
   `ANTHROPIC_API_KEY` exists and has a recent `updatedAt`. If suspicious,
   ask user to rotate the key.

3. **Sanity-check Anthropic account state.**
   Check `console.anthropic.com` → Usage / Billing for the account that
   owns the production key. Look for hard-stop, unpaid invoice, or rate
   ceiling reached.

### Phase 2 — Improve diagnostics so we never debug blind again

Edit `src/app/api/propose-courses/route.ts:34-39`:

```ts
} catch (err) {
  // Log enough to triage from Vercel's truncated table view.
  const detail =
    err instanceof Anthropic.APIError
      ? { name: err.name, status: err.status, message: err.message }
      : err instanceof Error
        ? { name: err.name, message: err.message }
        : { value: String(err) }
  console.error('[propose-courses] error:', JSON.stringify(detail))

  const userMessage = err instanceof Error && err.message.startsWith('Candidate proposal')
    ? err.message
    : 'Failed to generate course candidates. Please try again.'
  return NextResponse.json({ error: userMessage }, { status: 500 })
}
```

Apply the same logging shape to `src/app/api/curate/route.ts` and
`src/app/api/fetch-posts/route.ts` so the next prod incident doesn't
hit the same wall.

### Phase 3 — Fix the root cause (branches by hypothesis)

Once the real error body is in hand, exactly one of:

- **H1a (key/billing/entitlement):** rotate or upgrade the production
  Anthropic key, no code change. Smoke-test prod after env update.
- **H1b (rate limit):** add a short retry-with-backoff for transient
  `429`s in `src/lib/ai.ts:234` (a single retry after 5–10s is enough
  to absorb burst limits without bloating the 60s `maxDuration`).
  Consider lowering `max_tokens` if the rate limit is on output TPM.
- **H2 (timeout):** raise `maxDuration` on
  `src/app/api/propose-courses/route.ts:7` to 120s, or shorten the
  prompt (drop `audience` or `wordCount` from
  `formatPostsForCuration`), or stream the tool call. Note: per the
  session-start Vercel knowledge update, default function timeout is
  300s on Fluid Compute, so we have room to raise without plan changes.
- **H3 (tool-use shape):** add a defensive retry-once when
  `tool_block` is missing or `stop_reason !== 'tool_use'`, with
  `tool_choice: { type: 'any' }` as a fallback.

### Phase 4 — Surface the correct error in the UI

Today the user sees a generic 500 in the network panel and presumably
a generic toast in the review form. Once the route returns
user-actionable messages, confirm `src/components/features/ReviewForm`
(or wherever `propose-courses` is consumed) renders `error` from the
JSON body rather than only HTTP status text.

### Phase 5 — Regression test

Add a Vitest case in `src/app/api/propose-courses/__tests__/` (or
co-located) that:

1. Mocks `getClient()` to return an Anthropic client whose
   `messages.create` rejects with `new Anthropic.APIError(429, ...)`.
2. Asserts the route returns 500 **and** that `console.error` was
   called with the structured detail object (status: 429, name, etc.).

This locks in the diagnostic improvement so a future refactor doesn't
silently revert us to `Er…` truncation.

## Out of scope

- Touching `/api/fetch-posts` or `src/lib/substack.ts`. The reported
  symptom is downstream of fetch-posts succeeding.
- Re-architecting the curate/propose split.
- Changing the Anthropic model — `claude-sonnet-4-6` is the current
  Sonnet release per session-level knowledge updates.

## Verification

- After Phase 2 ships: trigger a failing prod request, then re-query
  Vercel logs and confirm we now see structured detail instead of `Er…`.
- After Phase 3 ships: trigger the same Substack URL the user reported
  failing on; expect 200 with a `candidates` array, not a 500.
- After Phase 4 ships: in the UI, force a failure (e.g., temporarily
  invalidate the key on a preview deployment) and confirm the user-facing
  message is specific, not "something went wrong."

## Sources & references

- `src/app/api/propose-courses/route.ts:7,32,34-39` — route + catch
  that's swallowing detail.
- `src/lib/ai.ts:12,216-241,244,256` — model ID, the failing call site,
  and the only two `Candidate proposal …` throws (which the truncated
  `Er…` log is **not** matching).
- `src/types/index.ts` — `SubstackPostSchema`, `LessonCount`, response
  shape.
- Production deployment: `dpl_5pYL69RuC7ZuZ3rN47eV7rfKKbPE`
  (substack2eec.vercel.app).
- Anthropic SDK: `@anthropic-ai/sdk@^0.78.0` (per `package.json`); see
  `Anthropic.APIError` for `.status` field used in Phase 2 logging.
- CLAUDE.md: confirms `maxDuration` is set on `/api/curate` (180s) and
  `/api/propose-courses` (60s) but not on `/api/fetch-posts` —
  documenting this for future plans, not relevant to this fix.
