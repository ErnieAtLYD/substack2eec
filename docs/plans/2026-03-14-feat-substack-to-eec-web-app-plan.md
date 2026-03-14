---
title: "feat: Substack to Educational Email Course Web App"
type: feat
status: active
date: 2026-03-14
origin: docs/brainstorms/2026-03-14-substack2eec-brainstorm.md
---

# feat: Substack to Educational Email Course Web App

## Overview

Build a Next.js 15 TypeScript web app that turns any public Substack publication into a 5-email Educational Email Course (EEC). The user pastes a Substack URL, the app scrapes the posts, Claude AI curates and rewrites the best 5 into email-native lessons, the user reviews and edits, then downloads a ZIP of Markdown files — one per lesson.

(See brainstorm: `docs/brainstorms/2026-03-14-substack2eec-brainstorm.md`)

---

## Problem Statement

Newsletter writers spend significant time repurposing their Substack archives into email courses. Today this is a manual process: browsing posts, deciding which ones teach a coherent topic, then reformatting long-form blog writing into tight, actionable email lessons. This app automates the curation, sequencing, and rewriting steps so the author can go from URL to exportable course in minutes.

---

## Proposed Solution

A 3-step web UI backed by Next.js API routes:

1. **Fetch** — User pastes Substack URL → app calls Substack's JSON API to retrieve all public post metadata, then fetches full `body_html` for each
2. **Generate** — Claude analyzes all posts, selects 5 that form the best coherent course, sequences them, then rewrites each into an email-native lesson (streamed to the UI in real time)
3. **Review + Export** — User reviews all 5 lessons in editable textareas, then downloads a ZIP of Markdown files

---

## Technical Approach

### Architecture

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Server Component — renders <ReviewForm />
│   └── api/
│       ├── fetch-posts/
│       │   └── route.ts            # POST: scrape Substack, return public posts
│       ├── curate/
│       │   └── route.ts            # POST: streaming — curate + rewrite 5 lessons
│       └── export/
│           └── route.ts            # POST: generate + return ZIP
├── components/
│   └── features/
│       └── ReviewForm.tsx          # 'use client' — multi-step wizard
├── lib/
│   ├── substack.ts                 # Substack JSON API client
│   ├── ai.ts                       # Anthropic client + prompts (server-only)
│   └── export.ts                   # jszip ZIP builder (server-only)
├── types/
│   └── index.ts                    # shared TypeScript interfaces
└── env.ts                          # validated env vars via Zod (server-only)
```

### Key Data Types (`src/types/index.ts`)

```typescript
export interface SubstackPost {
  title: string
  subtitle: string | null
  slug: string
  publishedAt: string
  bodyHtml: string
  excerpt: string        // first 200 chars of extractTextFromHtml output — used in curation prompt
  bodyText: string       // full extracted plain text, truncated to MAX_POST_WORDS before any AI call
  audience: 'everyone' | 'paid'
  wordCount: number      // original word count from Substack API (pre-truncation, used for display)
}

export interface CuratedSelection {
  selectedSlugs: string[]        // 5 slugs in lesson sequence order
  courseTitle: string
  courseDescription: string
  lessonFoci: Record<string, string>  // slug → angle/focus for the lesson
}

export interface GeneratedLesson {
  lessonNumber: number
  title: string
  subjectLine: string            // email subject line ≤50 chars
  previewText: string            // email preview text ≤90 chars
  markdownBody: string
  keyTakeaway: string
  filename: string               // e.g. "lesson-01-why-this-matters.md"
}
```

### Substack Fetching Strategy (`src/lib/substack.ts`)

Use the undocumented but stable Substack JSON API (not RSS, which truncates content):

| Endpoint | Purpose |
|---|---|
| `/{pub}/api/v1/archive?sort=new&limit=25&offset=0` | Paginated list of post metadata |
| `/{pub}/api/v1/posts/{slug}` | Full post content including `body_html` |

- Rate limit: 1 req/sec — add 1000ms delay between full-post fetches
- Backoff: exponential on `429` (5s, 10s, 20s)
- Filter: only include posts with `audience === "everyone"` (skip paywalled)
- URL normalization: strip trailing slash and path, extract base hostname

### AI Pipeline (`src/lib/ai.ts`)

Two-step Claude interaction:

**Step 1 — Curation** (single synchronous call, ~1–2s)
- Send all post titles + subtitles + word counts + 200-char excerpt to Claude (not full bodies — keeps tokens low)
- Ask it to select 5 posts that form the best coherent educational sequence
- Return: `CuratedSelection` (selected slugs + course metadata + lesson angles)
- Model: `claude-sonnet-4-6` (strong reasoning for coherence analysis)

**Curation prompt:**

```typescript
// Input row per post — no full body at this stage
function formatPostsForCuration(posts: SubstackPost[]): string {
  return posts.map((p, i) =>
    [
      `[${i + 1}] slug: ${p.slug}`,
      `    title: ${p.title}`,
      p.subtitle ? `    subtitle: ${p.subtitle}` : null,
      `    published: ${p.publishedAt.slice(0, 10)}`,
      `    words: ${p.wordCount}`,
      `    excerpt: ${p.excerpt}`,  // first 200 chars of extractTextFromHtml output
    ].filter(Boolean).join('\n')
  ).join('\n\n');
}

const CURATION_SYSTEM = `\
You are an expert instructional designer specializing in email courses.
Your job is to review a Substack newsletter archive and select posts that \
together form the best possible Educational Email Course (EEC).

An EEC is a sequence of short, actionable emails that teach a reader \
one coherent topic — delivered one lesson at a time.

## What makes a great EEC

- Has a single teachable throughline the reader can master by lesson 5
- Progresses logically — each lesson builds on the last (scaffolded learning)
- Starts with motivation ("why this matters") and ends with mastery or a \
  concrete next step
- Avoids time-sensitive content, news, product announcements, or posts that \
  feel stale outside their original context
- Avoids redundancy — each selected post contributes something distinct
- Favors posts with enough substance to fill a 3–5 minute read

## Output format

Respond with valid JSON only. No markdown wrapper, no preamble, no explanation \
outside the JSON object.`;

function buildCurationPrompt(posts: SubstackPost[]): string {
  return `\
Below are ${posts.length} posts from a Substack newsletter archive.

${formatPostsForCuration(posts)}

---

Select exactly 5 posts (or fewer if the archive has fewer than 5 suitable posts) \
that together form the best EEC. For each selected post, identify the specific \
angle or insight to emphasize when rewriting it as an email lesson — the original \
post may cover many ideas; narrow it to one clear takeaway.

Respond with this JSON schema:

{
  "courseTitle": "<compelling course title, ≤60 chars>",
  "courseDescription": "<2–3 sentences: what the reader will learn and why it matters>",
  "targetAudience": "<who this course is for, 1 sentence>",
  "overallRationale": "<why these posts together form a coherent course>",
  "lessons": [
    {
      "slug": "<exact slug from the list above>",
      "sequencePosition": 1,
      "lessonFocus": "<the specific angle or insight to emphasize in this lesson>",
      "selectionRationale": "<why this post was chosen and how it serves the course arc>"
    }
  ]
}

The lessons array must be ordered by sequencePosition (1 = first email sent).`;
}
```

**Step 2 — Rewriting** (5 calls, streamed to UI)
- For each selected post in order: send `post.bodyText` → Claude rewrites as email lesson (text is already truncated to `MAX_POST_WORDS` — no further trimming needed)
- Use explicit Markdown schema (see below) to ensure consistent structure
- Use **prompt caching** on the shared course context block (course title, tone, audience, lessons written so far)
- Stream responses via `text/event-stream` SSE to the client for real-time feedback

**Lesson Markdown Schema:**

```markdown
## Lesson {N}: {Title}

**Subject line:** {email subject, ≤50 chars}
**Preview text:** {preview snippet, ≤90 chars}

---

### The Core Idea

[2–3 paragraphs. Conversational, no jargon without definition.]

### Why This Matters

[1–2 paragraphs grounding in a real use case or consequence.]

### How To Apply It

[3–5 numbered steps or short code block if technical.]

### The Mistake Everyone Makes

[1 paragraph: the most common error and how to sidestep it.]

---

**Key takeaway:** [one bold sentence]

**Next lesson:** [one-sentence teaser]
```

### Export (`src/lib/export.ts`)

Use `jszip` to bundle all 5 Markdown files:
- Filenames: `lesson-01-{slug}.md` through `lesson-05-{slug}.md`
- Include a `README.md` at the root with course title, description, and lesson list
- Return `arraybuffer` from `zip.generateAsync()` — do not use Node.js streams in App Router

### Route Handler Notes

- `/api/fetch-posts` — Node runtime (needs `user-agent` header, rate limiting with `setTimeout`)
- `/api/curate` — Node runtime + `export const maxDuration = 180` (AI calls can be slow)
- `/api/export` — Node runtime, returns `application/zip`
- **Do not** use Edge runtime — it strips `setTimeout`, Node APIs needed for rate limiting

---

## Implementation Phases

### Phase 1: Project Scaffold

**Goal:** Working Next.js 15 app with all dependencies installed and environment wired up.

Tasks:
- `npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"`
- Install deps: `@anthropic-ai/sdk`, `cheerio`, `jszip`, `zod`, `server-only`
- Create `.env.local` with `ANTHROPIC_API_KEY=`
- Create `.env.example` (committed)
- Create `src/env.ts` — Zod validation of env vars
- Create `src/types/index.ts` — all shared interfaces
- Populate project `CLAUDE.md` with conventions (run command, env vars, directory structure)
- Verify `npm run dev` starts cleanly

Deliverables:
- `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`
- `src/env.ts`, `src/types/index.ts`
- `.env.example`, `CLAUDE.md`

### Phase 2: Substack Fetcher

**Goal:** Given a Substack URL, return an array of all public posts with full body HTML.

Tasks:
- Implement `src/lib/substack.ts`:
  - `normalizeSubstackUrl(url: string): string` — extract base hostname
  - `fetchPostList(pub: string): AsyncGenerator<SubstackPost>` — paginated archive fetch, 1 req/sec
  - `fetchFullPost(pub: string, slug: string): Promise<SubstackPost>` — `/api/v1/posts/{slug}`
  - `fetchWithRetry(url: string, retries = 3): Promise<Response>` — exponential backoff
  - `MAX_POST_WORDS = 2500` — module-level constant; cap applied at extraction time
  - `extractTextFromHtml(html: string): string` — parse with `cheerio`, strip `.subscription-widget`, `.share-widget`, `<footer>`, Substack embeds/subscribe widgets; call `$('p, h1, h2, h3, h4, li').after('\n\n')` before `.text()` to preserve paragraph breaks; truncate to `MAX_POST_WORDS` words then walk back to the last sentence boundary (`'. '`, `'! '`, `'? '`) before returning; truncation happens here, not at the AI call site
  - Note: `word_count` is only present on the full post object (`/api/v1/posts/{slug}`), not on archive stubs — do not read it from the archive response
- Implement `src/app/api/fetch-posts/route.ts`:
  - `POST { url: string }` → `{ posts: SubstackPost[] }`
  - Validate input, handle errors (invalid URL, no public posts, rate limit)
  - Return up to 50 most recent public posts

Deliverables:
- `src/lib/substack.ts`
- `src/app/api/fetch-posts/route.ts`

### Phase 3: AI Curation + Rewriting (Streaming)

**Goal:** Given fetched posts, Claude picks 5 and rewrites them as email lessons, streaming output to client.

Tasks:
- Implement `src/lib/ai.ts`:
  - `curatePostSelection(posts: SubstackPost[]): Promise<CuratedSelection>` — single synchronous call
  - `rewriteAsLesson(post: SubstackPost, lessonNum: number, courseCtx: CuratedSelection, priorLessons: GeneratedLesson[]): AsyncIterable<string>` — streaming call with prompt caching
  - Define curation prompt and lesson schema prompt as module-level constants
- Implement `src/app/api/curate/route.ts`:
  - `POST { posts: SubstackPost[] }` → SSE stream
  - Step 1: run curation (synchronous), emit `{ type: 'selection', data: CuratedSelection }` event
  - Step 2: for each selected post in order, stream rewriting, emit `{ type: 'lesson_chunk', lessonNumber, text }` events
  - Final event: `{ type: 'done', lessons: GeneratedLesson[] }`
  - `export const maxDuration = 180`

Deliverables:
- `src/lib/ai.ts`
- `src/app/api/curate/route.ts`

### Phase 4: Review UI

**Goal:** Multi-step UI that shows progress, lets user review/edit, and triggers export.

Tasks:
- Implement `src/components/features/ReviewForm.tsx` (`'use client'`):
  - **Step: `input`** — text input for Substack URL + "Generate Course" button; on mount, check `sessionStorage` for existing lessons and jump straight to `review` if present (allows page refresh recovery)
  - **Step: `generating`** — streaming progress display (SSE consumer, shows lesson appearing in real time); start a 90-second `setTimeout` when the request begins — if no `done` event has arrived by then, surface a non-blocking warning: "This is taking longer than usual — still working…" (clear the warning on `done` or `error`)
  - **Step: `review`** — 5 editable `<textarea>` panels (one per lesson), with filename shown above each; "Download ZIP" button
  - **Step: `downloading`** — brief disabled state while export route responds
  - Error states for each step (network error, no public posts, AI failure)
- **Lesson state in `sessionStorage`**, not React state:
  - Key: `eec_lessons` — JSON-serialized `GeneratedLesson[]`
  - Write to `sessionStorage` as each lesson arrives from the SSE stream (append, not replace)
  - On every `<textarea>` edit, write the full updated array back to `sessionStorage` immediately
  - On "Start Over", call `sessionStorage.removeItem('eec_lessons')` before resetting to `input` step
  - React state (`useState`) holds the in-memory copy for rendering; `sessionStorage` is the source of truth for persistence — initialise from `sessionStorage` on mount, keep both in sync on every write
- Update `src/app/page.tsx` to render `<ReviewForm />`
- Basic Tailwind styling: clean single-column layout, good textarea sizing

Deliverables:
- `src/components/features/ReviewForm.tsx`
- `src/app/page.tsx` (minimal update)

### Phase 5: Export

**Goal:** Convert the 5 edited Markdown files into a downloadable ZIP.

Tasks:
- Implement `src/lib/export.ts`:
  - `buildZip(lessons: GeneratedLesson[]): Promise<ArrayBuffer>` — jszip bundle with `lesson-0N-{slug}.md` + `README.md`
  - `buildReadme(courseTitle: string, courseDescription: string, lessons: GeneratedLesson[]): string` — Markdown table of contents
- Implement `src/app/api/export/route.ts`:
  - `POST { lessons: GeneratedLesson[] }` → `application/zip` download
  - `Content-Disposition: attachment; filename="{courseTitle}-eec.zip"`

Deliverables:
- `src/lib/export.ts`
- `src/app/api/export/route.ts`

---

## Alternative Approaches Considered

| Approach | Why Rejected |
|---|---|
| RSS feed instead of JSON API | RSS truncates body content — not enough to analyze or rewrite |
| Message Batches API for rewriting | Async polling would require background jobs, adds complexity; streaming SSE is better UX |
| Page Router instead of App Router | App Router is current recommendation; better for streaming Route Handlers |
| OpenAI instead of Claude | Claude has stronger long-context reasoning for analyzing many posts at once (see brainstorm) |
| Puppeteer/Playwright for scraping | Substack's JSON API is more reliable and doesn't require headless browser overhead |
| ZIP via Node streams | App Router `Response` doesn't accept Node streams — jszip `arraybuffer` is the correct pattern |

---

## System-Wide Impact

### Interaction Graph

```
User submits URL
  → POST /api/fetch-posts
    → substack.normalizeSubstackUrl()
    → substack.fetchPostList()         # pagination loop, 1 req/sec
      → substack.fetchWithRetry()      # each archive page
    → substack.fetchFullPost()         # per-post, 1 req/sec
      → substack.fetchWithRetry()
      → cheerio.load() → extractTextFromHtml()
    → returns SubstackPost[]
  → client calls POST /api/curate (SSE)
    → ai.curatePostSelection()         # synchronous Claude call
    → for each of 5 posts:
        ai.rewriteAsLesson()           # streaming Claude call with prompt caching
        → emits SSE chunks to client
    → emits 'done' event
  → user edits lessons in UI
  → POST /api/export
    → export.buildZip()               # jszip arraybuffer
    → returns .zip download
```

### Error & Failure Propagation

| Error type | Where it originates | How it surfaces |
|---|---|---|
| Invalid Substack URL | `normalizeSubstackUrl()` | 400 from `/api/fetch-posts` → UI error state |
| No public posts | `fetchPostList()` loop | 422 from `/api/fetch-posts` → "No public posts found" message |
| Substack 429 | `fetchWithRetry()` | Retries 3x; on exhaustion → 503 from API route |
| Anthropic rate limit | `ai.curatePostSelection()` | 429 → emit `{ type: 'error' }` SSE event |
| Anthropic context limit | `rewriteAsLesson()` | `max_tokens` exceeded — truncation or error event |
| Claude streaming error | SSE stream mid-flight | Emit error event; UI shows partial lessons + retry option |
| Export failure | `buildZip()` | 500 from `/api/export` → UI shows download error |

### State Lifecycle Risks

- Lesson state persists in `sessionStorage` (`eec_lessons` key) — survives page refresh within the same tab, cleared on "Start Over" or tab close
- React `useState` mirrors `sessionStorage` for rendering; writes go to both on every change
- No partial failure persistence across the SSE stream: if generation fails mid-way, only the lessons already written to `sessionStorage` survive; the user can refresh and resume review of what arrived, but cannot resume generation
- Large posts are bounded by `MAX_POST_WORDS = 2500` enforced inside `extractTextFromHtml` — the AI call sites receive pre-truncated text and have no special-case handling for length.

### API Surface Parity

No other interfaces — this is a standalone app with no shared API consumers.

### Integration Test Scenarios

1. **Substack URL with 3 public posts** → app should warn user, generate a 3-lesson course instead of 5
2. **Substack URL with all paywalled posts** → `/api/fetch-posts` returns 422 "No public posts found"
3. **User edits Lesson 2 text before downloading** → ZIP should contain the edited content, not the original AI output
4. **Anthropic API key missing** → `/api/curate` returns 500 early; UI shows meaningful error
5. **Substack 429 during full-post fetching** → retry behavior kicks in, fetch eventually succeeds or returns partial results with a warning

---

## Acceptance Criteria

### Functional

- [ ] User can paste any `https://*.substack.com` URL and trigger post fetching
- [ ] App fetches all public posts (audience = "everyone"), up to 50 most recent
- [ ] App skips paywalled posts silently; shows count of public vs. skipped
- [ ] If fewer than 5 public posts exist, app generates a shorter course and informs user
- [ ] Claude selects and sequences 5 posts (or fewer if unavailable) into a coherent course
- [ ] Claude provides a course title, description, and per-lesson focus angle
- [ ] Each lesson is rewritten in email-native tone following the defined Markdown schema
- [ ] All 5 lessons stream to the UI in real time as they are generated
- [ ] User can edit any lesson's Markdown content before exporting
- [ ] "Download ZIP" produces a `.zip` with 5 `.md` files + `README.md`
- [ ] Filenames are slug-based and human-readable (e.g. `lesson-01-why-this-matters.md`)

### Non-Functional

- [ ] Full generation of 5 lessons completes in under 90 seconds on a standard connection
- [ ] No API keys exposed in client-side JavaScript bundles (`NEXT_PUBLIC_` not used)
- [ ] `ANTHROPIC_API_KEY` validated at server startup via Zod — fails with clear error if missing
- [ ] Substack fetcher respects 1 req/sec rate limit; handles 429 with exponential backoff

### Quality Gates

- [ ] TypeScript strict mode passes with no `any` types in `src/lib/` or `src/types/`
- [ ] All `src/lib/` modules import `server-only` to prevent accidental client bundle inclusion
- [ ] `.env.example` committed; `.env.local` in `.gitignore`

---

## Success Metrics

- User can go from Substack URL to downloadable course ZIP in one session without errors
- Generated lessons follow the defined schema (all required sections present)
- Course has coherent progression (lessons build on each other, no concept repetition)

---

## Dependencies & Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| `next` | 15.x | App Router, Route Handlers, streaming |
| `@anthropic-ai/sdk` | latest | Claude API client |
| `cheerio` | 1.x | HTML parsing for Substack body_html |
| `jszip` | 3.x | ZIP file generation |
| `zod` | 3.x | Env var validation |
| `server-only` | latest | Prevent client-side import of server modules |
| `tailwindcss` | 4.x | Styling |

**External dependencies:**
- Anthropic Claude API account with `ANTHROPIC_API_KEY` (Tier 1 is sufficient for MVP)
- Public Substack publication to test with

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Substack changes JSON API | Medium | High | Abstract behind `src/lib/substack.ts`; easy to swap endpoint |
| Claude rewrites are low quality | Medium | Medium | Explicit schema prompt + key section validation |
| Large publication times out (50+ posts × 1 req/sec = 50s) | Medium | Medium | Cap at 50 posts; surface progress indicator in UI |
| Anthropic Tier 1 rate limit hit (30k ITPM) | Low | Medium | `MAX_POST_WORDS = 2500` caps source material at ~3,300 tokens/call; 5 calls = ~13,500 tokens max; prompt caching covers the rest |
| Substack ToS for scraping | Low | Low | Personal/internal use; no redistribution; rate-limited |

---

## Future Considerations

- Custom course length (3, 7, 10 emails)
- User-provided topic prompt to guide curation ("focus on productivity tips")
- Direct import to ConvertKit / Beehiiv via their APIs
- Persist generated courses (database + auth) for returning users
- Support for custom-domain Substack publications

---

## Documentation Plan

- Populate `CLAUDE.md` at project root after scaffold (run command, env vars, directory conventions)
- Add `README.md` to repo with setup instructions (env vars, `npm run dev`)

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-14-substack2eec-brainstorm.md](../brainstorms/2026-03-14-substack2eec-brainstorm.md)
  - Key decisions carried forward: Next.js + TypeScript, AI-curated 5-email course, Markdown export, Claude (Anthropic), scrape full HTML, paywalled posts out of scope

### Internal References

- N/A — greenfield project

### External References

- Substack JSON API: `https://{pub}.substack.com/api/v1/archive` and `/api/v1/posts/{slug}`
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-python)
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Anthropic Rate Limits](https://platform.claude.com/docs/en/api/rate-limits)
- [Next.js 15 Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js Environment Variables](https://nextjs.org/docs/pages/guides/environment-variables)
- `jszip` for ZIP generation in App Router (use `arraybuffer`, not Node streams)
- Claude model: `claude-sonnet-4-6` for curation + rewriting
