# Brainstorm: substack2eec

**Date:** 2026-03-14
**Status:** Draft

---

## What We're Building

A Next.js (TypeScript) web app that takes a Substack publication URL, fetches the posts, uses an AI model to curate a subset of them, and outputs a structured **Educational Email Course (EEC)** — a sequenced series of emails designed to teach readers a topic progressively.

**User flow:**
1. User pastes a Substack URL into the web app
2. App fetches the list of posts from that Substack
3. AI analyzes posts and selects the best subset to form a coherent course
4. AI sequences them and generates course metadata (title, description, lesson order)
5. User reviews and exports the EEC in their preferred format

---

## Why This Approach

- **Next.js full-stack**: API routes handle scraping and AI calls server-side; React handles the interactive review UI. Single codebase, fast iteration.
- **AI curation**: Reduces friction — no manual picking. The LLM can identify thematic coherence, prerequisite ordering, and educational value across posts.
- **Web app over CLI**: Lowers the barrier to use; visual review step lets users confirm AI choices before export.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Interface | Web app | Easier review step, broader audience |
| Tech stack | Next.js (TypeScript) | Full-stack simplicity, strong ecosystem |
| Post selection | AI-curated | Reduces friction, leverages LLM reasoning |
| Output format | Markdown files (one per lesson) | Easy to paste into any email tool |

---

## Proposed Architecture

```
[User] → [Next.js UI]
              ↓
         [API Route: /api/fetch-posts]
              ↓
         [Substack fetcher] (RSS feed or HTML scrape)
              ↓
         [API Route: /api/curate]
              ↓
         [LLM: analyze + select + sequence posts]
              ↓
         [Review UI: show proposed course]
              ↓
         [Export: download in chosen format]
```

---

## Open Questions

*(none)*

---

## Resolved Questions

- **Output format**: Markdown files, one per lesson — easy to paste into any email tool
- **Substack data access**: Scrape full post HTML (works for public posts)
- **AI model**: Claude (Anthropic) — strong long-context reasoning
- **Course length**: 5 emails by default
- **Content handling**: AI rewrites each post in an email-native tone and format
- **AI curation**: LLM selects the best 5 posts and sequences them as a coherent course
- **Paywalled content**: Out of scope for now — only public posts are supported
