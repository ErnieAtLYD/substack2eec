# substack2eec

Convert a Substack newsletter archive into a ready-to-send Educational Email Course (EEC).

Paste a Substack URL → the app fetches public posts, uses Claude to pick the best 3–5 lessons, rewrites each one as a tight email, and exports a ZIP of Markdown files.

## How it works

1. **Fetch** — scrapes the Substack public archive (1 req/sec, exponential backoff on 429s, paywalled posts skipped)
2. **Curate** — Claude picks and sequences up to 5 posts that form a coherent course arc, using tool use for structured output
3. **Rewrite** — Claude rewrites each post as an email lesson (subject line, preview text, 400–600 word body, key takeaway) via streaming SSE
4. **Export** — download a ZIP of `.md` files, one per lesson

## Stack

- Next.js 15 (App Router, Node runtime)
- Anthropic SDK — `claude-sonnet-4-6`
- Cheerio for HTML extraction
- JSZip for the export bundle

## Setup

```bash
cp .env.example .env.local
# add your ANTHROPIC_API_KEY
npm install
npm run dev        # http://localhost:3000
```

## Env vars

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Anthropic API key |

Never use `NEXT_PUBLIC_` — API keys must not reach the client.

## Dev notes

- `src/lib/` files all import `server-only` — they contain secrets
- `/api/curate` streams SSE; `maxDuration = 180` for Vercel
- Posts are truncated to 2500 words at extraction time (`MAX_POST_WORDS`)
- Spike tester: `npx tsx spike/extract.ts <url> [limit]`
