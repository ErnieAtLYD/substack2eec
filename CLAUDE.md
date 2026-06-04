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

- IMPORTANT: When I report a bug, don't start by trying to fix it. Instead, start by writing a test that reproduces the bug. Then, have subagents try to fix the bug and prove it with a passing test.
- All `src/lib/` files must import `server-only` — they contain secrets. **Exception: `src/lib/limits.ts`** — client-safe numeric constants, imported by the UI (`ReviewForm.tsx`); adding `server-only` there would break the client build
- No `NEXT_PUBLIC_` prefix on env vars — API keys must never reach the client
- Route Handlers use Node runtime (not Edge) — needed for `setTimeout` rate limiting
- `export const maxDuration = 180` on `/api/curate`; `export const maxDuration = 60` on `/api/propose-courses`
- Substack fetcher: 1 req/sec, exponential backoff on 429
- Trust-boundary input caps live in `src/lib/limits.ts` — single source of truth:
  - `MAX_PROMPT_FIELD_LEN = 300` — short prompt-bound fields (title, subtitle, excerpt, lesson titles)
  - `MAX_BODY_CHARS = 30_000` — DoS bound on `bodyText` (binding constraint for typical English is `MAX_POST_WORDS`)
  - `MAX_POST_WORDS = 2500` — LLM-budget cap on `bodyText` (truncation at extraction time and at the route boundary)
- Trust-boundary discipline: any route handler that forwards user input to `src/lib/ai.ts` MUST cap every string field at the boundary using `safeSlice` (from `src/lib/safe-string.ts`) and the constants in `src/lib/limits.ts`. Helpers in `src/lib/ai.ts` (`collapsePromptWhitespace`) MUST assert (not silently re-truncate) when input exceeds the documented cap — silent re-truncation hides regressions like #146.



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

// Errors: 400 (bad input, or lessonCount not in [3, 5, 7, 10]), 500 (AI failure)
```

`lessonCount` must be one of `[3, 5, 7, 10]`; invalid values return 400.

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


| Event type     | Shape                                                          | Notes                                                                                      |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `selection`    | `{ type: 'selection', data: CuratedSelection }`                | Emitted once; contains courseTitle, courseDescription, targetAudience, ordered lesson plan |
| `lesson_start` | `{ type: 'lesson_start', lessonNumber: number }`               | Emitted before each lesson rewrite begins                                                  |
| `lesson_chunk` | `{ type: 'lesson_chunk', lessonNumber: number, text: string }` | Streaming markdown chunk for in-progress lesson                                            |
| `lesson_done`  | `{ type: 'lesson_done', lesson: GeneratedLesson }`             | Emitted when a lesson is fully written; collect these                                      |
| `done`         | `{ type: 'done', lessons: GeneratedLesson[] }`                 | Final event; `lessons` is the full ordered array                                           |
| `error`        | `{ type: 'error', message: string }`                           | Fatal error; stream closes                                                                 |


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

Note: a malformed upstream response may never emit a `\n\n` frame terminator; clients that buffer for reassembly should bound the unterminated remainder (the web UI caps it at `MAX_SSE_BUFFER_CHARS` — a client-implementation defense, not an API guarantee).

Note: disconnecting the HTTP connection cancels generation server-side — the in-flight Anthropic request is aborted and token spend stops. This works for **any** client (the server observes `request.signal`), not just the web UI. An aborted stream closes with **no further events** (no `done`, no `error`); only a connection that runs to completion is guaranteed to end with `done`. Use this to stop a course you no longer need — do not treat a missing `done` after your own disconnect as a failure.

Constraints: max 50 posts; `lessonCount` must be one of `[3, 5, 7, 10]`; `maxDuration = 180s`.

Note: when `selectedCourse` is provided, `lessonCount` is ignored — the lesson plan is determined entirely by `selectedCourse.lessons`.

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

