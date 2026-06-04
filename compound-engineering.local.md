---
review_agents:
  - compound-engineering:review:kieran-typescript-reviewer
  - compound-engineering:review:security-sentinel
  - compound-engineering:review:performance-oracle
  - compound-engineering:review:code-simplicity-reviewer
---

# substack2eec — Compound Engineering Config

Next.js 15 TypeScript app. Single-page UI (`ReviewForm.tsx`) with SSE streaming from Anthropic Claude API.

## Review Context

- All `src/lib/` files must import `server-only` — secrets must never reach the client. Exception: `src/lib/limits.ts` (client-safe numeric constants, imported by the UI — do not "fix" it by adding `server-only`)
- No `NEXT_PUBLIC_` env vars — API keys are server-only
- Route Handlers use Node runtime (not Edge)
- `MAX_POST_WORDS = 2500` truncation in `src/lib/substack.ts`
- Substack fetcher: 1 req/sec rate limiting, exponential backoff on 429
