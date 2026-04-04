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
- `export const maxDuration = 180` on `/api/curate`; `export const maxDuration = 60` on `/api/propose-courses`
- Substack fetcher: 1 req/sec, exponential backoff on 429
- `MAX_POST_WORDS = 2500` in `src/lib/substack.ts` — truncation at extraction time

## Spike code
- `spike/extract.ts` — standalone extraction tester: `npx tsx spike/extract.ts <url> [limit]`

## Agent API

Four-step pipeline (propose is optional): fetch → [propose →] curate (SSE) → export.

### Step 1 — POST /api/fetch-posts

```ts
// Request
{ url: string }  // any Substack URL (normalized server-side)

// Response 200
{ posts: SubstackPost[], skippedCount: number }

// Errors: 400 (bad url), 404 (pub not found), 422 (no public posts), 503 (rate-limited)
```

Constraint: max 50 posts are fetched internally. `skippedCount` reflects paywalled posts skipped.

### Step 1b (optional) — POST /api/propose-courses

```ts
// Request
{ posts: SubstackPost[], lessonCount?: number }

// Response 200
{ candidates: CuratedSelection[] }   // always exactly 3 distinct themes

// Errors: 400 (bad input), 500 (AI failure)
```

Returns 3 thematically distinct course candidates. Pass the chosen `CuratedSelection`
as `selectedCourse` to `POST /api/curate` to skip auto-curation and go straight to
lesson rewriting. `candidateCount` is fixed at 3 and is not a request parameter.

### Step 2 — POST /api/curate (SSE stream)

```ts
// Request
{
  posts: SubstackPost[],
  lessonCount?: 3 | 5 | 7 | 10,
  selectedCourse?: CuratedSelection  // if provided, skips AI curation step
}
// lessonCount defaults to 5 if omitted or invalid

// Response: text/event-stream — each line: `data: <JSON>\n\n`
```

SSE event sequence:

| Event type | Shape | Notes |
|---|---|---|
| `selection` | `{ type: 'selection', data: CuratedSelection }` | Emitted once; contains courseTitle, courseDescription, targetAudience, ordered lesson plan |
| `lesson_start` | `{ type: 'lesson_start', lessonNumber: number }` | Emitted before each lesson rewrite begins |
| `lesson_chunk` | `{ type: 'lesson_chunk', lessonNumber: number, text: string }` | Streaming markdown chunk for in-progress lesson |
| `lesson_done` | `{ type: 'lesson_done', lesson: GeneratedLesson }` | Emitted when a lesson is fully written; collect these |
| `done` | `{ type: 'done', lessons: GeneratedLesson[] }` | Final event; `lessons` is the full ordered array |
| `error` | `{ type: 'error', message: string }` | Fatal error; stream closes |

Parse SSE:

```ts
for await (const line of response.body) {
  if (!line.startsWith('data: ')) continue
  const event: CurateSSEEvent = JSON.parse(line.slice(6))
  if (event.type === 'lesson_done') lessons.push(event.lesson)
  if (event.type === 'done') break
  if (event.type === 'error') throw new Error(event.message)
}
```

Constraints: max 50 posts; `lessonCount` must be one of `[3, 5, 7, 10]`; `maxDuration = 180s`.

Note: `lessonCount` values 3, 7, 10 are agent-only — the UI only exposes 5.

### Edit step (optional)

After collecting `lesson_done` events, mutate `GeneratedLesson` fields before export:

```ts
// Editable fields on GeneratedLesson:
lesson.markdownBody    // main email body markdown
lesson.title           // lesson title
lesson.subjectLine     // email subject line (≤50 chars)
lesson.previewText     // email preview text (≤90 chars)
lesson.keyTakeaway     // key takeaway text
// lesson.lessonNumber and lesson.filename are structural — change only if reordering
```

### Step 3 — POST /api/export

```ts
// Request
{
  lessons: GeneratedLesson[],
  courseTitle: string,       // used for ZIP filename
  courseDescription: string
}

// Response 200: application/zip binary
// Content-Disposition: attachment; filename="<slugified-title>-eec.zip"

// Errors: 400 (no lessons), 500 (zip build failure)
```

`courseTitle` and `courseDescription` can come from the `selection` event's `CuratedSelection.courseTitle` / `.courseDescription`, or be overridden.
