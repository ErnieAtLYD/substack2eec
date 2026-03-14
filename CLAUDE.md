# CLAUDE.md — substack2eec

## Dev server
```bash
npm run dev   # http://localhost:3000
```

## Environment variables
- `ANTHROPIC_API_KEY` — required, set in `.env.local` (never commit)
- See `.env.example` for the full list

## Directory conventions
```
src/
├── app/
│   ├── api/fetch-posts/route.ts   # POST: scrape Substack posts
│   ├── api/curate/route.ts        # POST: SSE stream — curate + rewrite
│   └── api/export/route.ts        # POST: ZIP download
├── components/features/           # 'use client' feature components
├── lib/
│   ├── substack.ts                # Substack JSON API client (server-only)
│   ├── ai.ts                      # Anthropic client + prompts (server-only)
│   └── export.ts                  # jszip builder (server-only)
├── types/index.ts                 # shared TypeScript interfaces
└── env.ts                         # Zod-validated env vars (server-only)
```

## Key rules
- All `src/lib/` files must import `server-only` — they contain secrets
- No `NEXT_PUBLIC_` prefix on env vars — API keys must never reach the client
- Route Handlers use Node runtime (not Edge) — needed for `setTimeout` rate limiting
- `export const maxDuration = 180` on `/api/curate`
- Substack fetcher: 1 req/sec, exponential backoff on 429
- `MAX_POST_WORDS = 2500` in `src/lib/substack.ts` — truncation at extraction time

## Spike code
- `spike/extract.ts` — standalone extraction tester: `npx tsx spike/extract.ts <url> [limit]`
