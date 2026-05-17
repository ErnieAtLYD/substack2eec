---
title: Complete /api/curate trust-boundary enforcement for prompt-bound fields
type: refactor
status: active
date: 2026-05-10
---

# ♻️ Complete `/api/curate` Trust-Boundary Enforcement For Prompt-Bound Fields

## Enhancement Summary

**Deepened on:** 2026-05-10
**Sections enhanced:** 8 (Problem Statement, Proposed Solution, Phases, Alternatives, System-Wide Impact, Risk Analysis, Acceptance Criteria, Future Considerations)
**Research/review agents used:** kieran-typescript-reviewer, security-sentinel, performance-oracle, code-simplicity-reviewer, architecture-strategist, pattern-recognition-specialist, best-practices-researcher, framework-docs-researcher, plus two Explore agents (TS surrogate libraries, OWASP LLM 2026 + Anthropic guidance).

### Key Improvements (incorporated)

1. **`priorLessons[*].title` and `keyTakeaway` are now in scope** — security-sentinel surfaced a second-order injection / cost-amplification path: each lesson's parsed output re-enters subsequent rewrite prompts via `completedLessons`, with no length cap. Fixed by capping in `parseLessonMarkdown` or at route push site.
2. **`/api/propose-courses` parity is in scope** — same `posts: SubstackPost[]` shape, same `formatPostsForCuration`, same gap. Phase 3b adds it.
3. **`SubstackPostSchema.bodyHtml.max(500_000)` reduced** — `bodyHtml` is unused in `/api/curate`; 25 MB of attacker-controllable input was the *real* DoS surface, not `MAX_BODY_CHARS`.
4. **`src/lib/limits.ts` consolidation moved into THIS PR** — architecture and TS reviewers both flagged the deferred consolidation as accumulating debt that the next plan would have to undo. New Phase 0 lands the module.
5. **`sanitizeForPrompt` renamed to `collapsePromptWhitespace`** — names are how trust boundaries become visible. The rename is the architectural enforcement against the kind of name-driven regression that produced #146.
6. **`selectedCourse` field caps are now field-specific** — original plan blanket-capped to 300, silently shortening `courseDescription`/`overallRationale` from Zod's 500. New shape uses each field's existing Zod max so `safeSlice` is purely UTF-16 safety, not a quiet behavior change. (Caught by both security-sentinel and code-simplicity-reviewer independently.)
7. **`safeSlice` throws `RangeError` on negative `max`** — silent return swallows programmer bugs (kieran).
8. **Stronger sanitization regex** — `/[\n\r\t]/g` misses U+00A0 NBSP, U+2028/2029 line separators, U+FEFF BOM, and **U+202A–U+202E bidi-override** chars (a known prompt-injection vector — Rafter security blog). New regex: collapse all whitespace categories, then strip zero-width + bidi overrides as a separate pass.
9. **Test pins cap-before-collapse, not just cap-result** — security-sentinel: a future regression that moves the cap back into the helper still passes tests under the original assertions. New test asserts ordering at the call boundary.
10. **Corrected performance accounting** — performance-oracle: "O(1) extra work per field" was wrong; correct framing is "O(1) extra beyond the unavoidable O(max) copy." Memory peak is ~12 MB, not 1.5 MB (still fine, but accuracy matters for the Risk table).

### New Considerations Discovered

- **Branded types as a compiler-enforced trust boundary** (`type SanitizedPromptField = string & { __sanitized: true }`) — best-practices research surfaced this as a Vercel AI SDK 6 / Superagent pattern. Captured as **Alt 5**; recommended as a follow-up after this PR lands.
- **Push the cap into Zod via `.transform()`** — Zod 4.3.6 (current in repo) makes this clean. Captured as **Alt 6**; rejected for this PR to keep schemas purely descriptive, but worth revisiting.
- **Vitest 4.x `vi.hoisted` + `vi.mock(import('...'), ...)` pattern** — current canonical idiom; documented in the test extensions but not changed for the existing test (avoid scope creep).
- **OWASP LLM10 (Unbounded Consumption)** is the threat-model frame for length caps, more than LLM01 (Prompt Injection). Both apply; LLM10 is the operational driver. Cited in Sources.
- **`Intl.Segmenter` is wrong here** — confirmed it OOMs on strings >40-50K chars (jonschlinkert/intl-segmenter). The hand-rolled `safeSlice` is correct.
- **Real-world incidents** — gemini-cli #22753 had this exact `truncateString` surrogate bug; CVE-2025-48985 was a Vercel AI SDK input-validation bypass at the helper layer (not the boundary). Both validate the "cap at boundary, assert in helper" pattern.

### Cuts Considered, Rejected

- **Code-simplicity-reviewer recommended splitting into two PRs** (posts-fields + selectedCourse). Rejected: splitting reproduces the asymmetry the plan exists to close. Same trade-off as Alt 4; reasoning preserved.
- **Code-simplicity-reviewer recommended inlining `safeSlice` into `html-text.ts`.** Rejected by architecture-strategist: `safe-string` is UTF-16 hygiene, `html-text` is HTML extraction; merging conflates domains. The new file justifies its own existence the moment a second `.slice(0, N)` site adopts it (and there are 8 known sites).
- **Code-simplicity-reviewer recommended cutting tests from 21 → 6-7.** Partially accepted: tests consolidated where redundant, but coverage of new scope (priorLessons, propose-courses, ordering assertion) keeps the count similar. Quality and quantity are not the same.

---

## Overview

PR #17 re-enforced `MAX_POST_WORDS` on `bodyText` at the `/api/curate` route after a refactor silently bypassed it. Multi-agent review of that PR surfaced four follow-up findings (#162, #167, #168, #169) that share a single root cause: **the trust boundary is incomplete.** The route caps one field; it should cap every field that reaches the LLM, on both the auto-curation and `selectedCourse` branches, with a UTF-16-safe slice that doesn't emit lone surrogates.

This plan finishes that work in one PR and adds a UTF-16-safe slice helper that several existing call sites benefit from.

## Problem Statement

Six interlocking gaps in the `/api/curate` flow (the original four plus two surfaced by deepening review):

1. **Sibling-field gap (#162, P1).** Only `bodyText` is re-truncated at the route. `title`, `subtitle`, `excerpt` flow into `formatPostsForCuration` (`src/lib/ai.ts:88-99`) and rely on `sanitizeForPrompt` for their cap — exactly the transitive-defense pattern that #146 fixed for `bodyText`. A future refactor can break `sanitizeForPrompt`'s cap silently. *Same holds for `CuratedSelection` fields (`courseTitle`, `courseDescription`, `targetAudience`, `overallRationale`, `lessonFocus`, `selectionRationale`) that reach `xmlEscape` in rewrite prompts via the `selectedCourse` short-circuit — capped to **each field's existing Zod max** (60/500/200/500/300/300), not blanket-shortened to 300.*

2. **`MAX_BODY_CHARS` shadows `MAX_POST_WORDS` (#167, P2).** `15_000` chars ≈ 2,500-3,000 English words. The char cap is the *binding* constraint for typical English, and the word cap rarely fires — directly contradicting the route comment ("the cap that the LLM budget actually depends on"). Non-Latin content (CJK, emoji-heavy) flips the asymmetry and gets aggressively truncated.

3. **UTF-16 surrogate split (#168, P2).** `String.prototype.slice` operates on code units. Slicing emoji-rich `bodyText` at exactly the surrogate boundary produces a lone high surrogate, which JSON-stringifies as `\uD8XX` and reaches the LLM as garbage. Same defect lives in `sanitizeForPrompt` at `src/lib/ai.ts:85` — `s.slice(0, MAX_PROMPT_FIELD_LEN)`. Fixing one without the other leaves the bypass open. (See [gemini-cli #22753](https://github.com/google-gemini/gemini-cli/issues/22753) — same exact bug pattern in another OSS LLM tool.)

4. **`selectedCourse` branch has no regression test (#169, P2).** The new `curate-route-word-cap.test.ts` only exercises the auto-curation path. The `selectedCourse` short-circuit (`route.ts:64-78`) reuses the same already-truncated `posts` array, so the cap holds today — but PR #17's own postmortem (`docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md`) closes with: *"Pin trust-boundary contracts with tests, not by inspection."* That lesson applies symmetrically to both branches.

5. **`priorLessons` second-order injection (NEW, P1 — surfaced by deepening review).** Each call to `rewriteAsLesson` (`route.ts:97`) accepts a `completedLessons: GeneratedLesson[]` accumulator that becomes `priorLessons` context in subsequent prompts (`src/lib/ai.ts:341-342`, xml-escaped but **uncapped**). `parseLessonMarkdown` (`src/lib/ai.ts:428-438`) extracts `title` and `keyTakeaway` with no length cap — only `subjectLine` (50) and `previewText` (90) are sliced. An adversarial post body could induce the rewrite LLM to emit a 5000-char `**Key takeaway:**` line that then injects into every subsequent lesson's prompt context. **Cost-DoS amplification scales O(n²) across the lesson loop.** This is exactly the "LLM output is not trusted output. It is transformed user input." pattern documented in `docs/solutions/security-issues/prompt-injection-llm-pipeline.md`.

6. **`/api/propose-courses` has the same gap (NEW, P1 — surfaced by deepening review).** Same `posts: SubstackPost[]` shape, same `formatPostsForCuration` builder (`src/lib/ai.ts:88-99`), same prompt-injection / cost-DoS surface. Shipping this PR with `/api/curate` patched and `/api/propose-courses` unpatched reproduces the exact PR #17 → this-PR asymmetry the plan was filed to prevent.

**Adjacent finding worth fixing in the same PR (P2 — surfaced by deepening review):** `SubstackPostSchema.bodyHtml.max(500_000)` × 50 posts = **25 MB of attacker-controllable input per request** that Zod accepts before any truncation runs. `bodyHtml` is unused in `/api/curate` and `/api/propose-courses` — only `/api/fetch-posts` ever sees it. Drop the schema cap on those two routes (or split the schema into `SubstackPostInputSchema` for inbound fields and `SubstackPostFullSchema` for the fetcher's output).

## Proposed Solution

**Ten coordinated changes shipped as one PR** (was 5; deepening surfaced 5 more):

| # | Change | Files | Effort |
|---|---|---|---|
| 0 | **NEW** — `src/lib/limits.ts` consolidates `MAX_PROMPT_FIELD_LEN`, `MAX_BODY_CHARS`, `MAX_POST_WORDS` as `as const` literal-typed exports | NEW | XS |
| 1 | New `src/lib/safe-string.ts` exporting `safeSlice(s, max)` — UTF-16-safe slice that never emits a lone surrogate, **throws `RangeError` on negative `max`** | NEW | S |
| 2 | **Rename `sanitizeForPrompt` → `collapsePromptWhitespace`** (architectural enforcement of trust-boundary semantics); switch to `safeSlice`; **strengthen regex** to handle NBSP / U+2028-2029 / bidi-override / zero-width chars | `src/lib/ai.ts`, all callers | S |
| 3 | `/api/curate` route caps every prompt-bound field via `safeSlice` on **input posts** (`title`/`subtitle`/`excerpt` at `MAX_PROMPT_FIELD_LEN`, `bodyText` at `MAX_BODY_CHARS`) and on **`selectedCourse`** fields **at each field's existing Zod max** (NOT blanket 300 — that would silently shorten `courseDescription`/`overallRationale`); add `satisfies SubstackPost` / `satisfies CuratedSelection` clauses | `src/app/api/curate/route.ts` | S |
| 3b | **NEW** — Apply the identical normalization to `/api/propose-courses` (same `posts: SubstackPost[]` shape, same `formatPostsForCuration`, same gap) | `src/app/api/propose-courses/route.ts` | XS |
| 3c | **NEW** — Cap `priorLessons[*].title` and `priorLessons[*].keyTakeaway` in `parseLessonMarkdown` (or at the route push site) to close the second-order injection / cost-amplification path | `src/lib/ai.ts`, `src/app/api/curate/route.ts` | XS |
| 4 | Raise `MAX_BODY_CHARS` from `15_000` to `30_000` so the word cap is the binding LLM-budget constraint | `src/lib/limits.ts`, `CLAUDE.md` | XS |
| 4b | **NEW** — Reduce `SubstackPostSchema.bodyHtml.max` from `500_000` to `50_000` (or remove `bodyHtml` from `CurateRequestSchema`/`ProposeCoursesRequestSchema` entirely — it's unused there) | `src/types/index.ts` | XS |
| 5 | Extend `curate-route-word-cap.test.ts` with `selectedCourse`-branch coverage, sibling-field caps, surrogate-boundary cases, **plus a test that asserts the cap fires BEFORE `collapsePromptWhitespace` runs** (catches the next #146-shaped regression); add new `safe-string.test.ts` and `ai-collapse-prompt-whitespace.test.ts` (matches existing `ai-filename.test.ts` naming convention) | tests | S |
| 5b | **NEW** — Add prelude latency assertion (`< 50 ms` for 50 × 30k posts) as integration canary | tests | XS |

The route becomes the **single trust boundary** for "what shape can reach the LLM." `collapsePromptWhitespace` and `xmlEscape` continue to do their downstream prompt-shaping work (whitespace collapse + bidi-strip, XML escape) but no longer carry the cap as a load-bearing responsibility — and the rename makes that demotion visible at every callsite.

**Total estimated effort:** 1.5–2 focused days (was 1; the priorLessons + propose-courses + limits.ts work adds ~half a day).

## Technical Approach

### Architecture

```
┌──────────────────┐
│  Direct API      │
│  caller / UI     │
└────────┬─────────┘
         │ POST /api/curate
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/app/api/curate/route.ts                                    │
│                                                                 │
│  ┌──────────────────┐   ┌──────────────────────────────────┐    │
│  │ Zod validation   │   │ Trust-boundary normalization     │    │
│  │ (existing)       │ ▶ │ (Change 3 — NEW for sibling      │    │
│  │ SubstackPost     │   │  fields and selectedCourse)      │    │
│  │ Schema, etc.     │   │                                  │    │
│  └──────────────────┘   │  posts.map(p => ({               │    │
│                         │    title:    safeSlice(... 300), │    │
│                         │    subtitle: safeSlice(... 300), │    │
│                         │    excerpt:  safeSlice(... 300), │    │
│                         │    bodyText: truncateTextToWords(│    │
│                         │      safeSlice(p.bodyText,       │    │
│                         │                MAX_BODY_CHARS),  │    │
│                         │      MAX_POST_WORDS),            │    │
│                         │  }))                             │    │
│                         │  + analogous map on              │    │
│                         │    selectedCourse fields         │    │
│                         └────────────┬─────────────────────┘    │
│                                      │                          │
│                                      ▼                          │
│  slug cross-ref guard ──▶ open SSE stream ──▶ ai.ts callsites   │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/lib/ai.ts                                                  │
│                                                                 │
│  sanitizeForPrompt(s)                                           │
│    = safeSlice(s, MAX_PROMPT_FIELD_LEN)                         │
│        .replace(/[\n\r\t]/g, ' ')   ← order matters: cap first, │
│                                       collapse second; pinned   │
│                                       by sanitize-for-prompt    │
│                                       test (Change 5)           │
│                                                                 │
│  xmlEscape(s)                ← unchanged                        │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Phases

#### Phase 0: Foundation — `src/lib/limits.ts` consolidation

**Why first:** Every subsequent phase imports from this module. Doing this last (or deferring it) would mean rewriting every import in this PR.

**Tasks:**
1. Create `src/lib/limits.ts`:
   ```ts
   // Trust-boundary input caps. Single source of truth for "how much
   // attacker-controlled string can reach the LLM." Imported by route handlers
   // (the trust boundary) and by helpers in src/lib/ai.ts (defense-in-depth assertions).
   export const MAX_PROMPT_FIELD_LEN = 300 as const   // short prompt-bound fields
   export const MAX_BODY_CHARS       = 30_000 as const // DoS bound on bodyText (raised from 15_000)
   export const MAX_POST_WORDS       = 2500 as const   // LLM-budget cap on bodyText (binding constraint)
   ```
2. Update `src/lib/html-text.ts` — re-export `MAX_POST_WORDS` from `@/lib/limits` for back-compat (or change `extractTextFromHtml` to import from `limits`); remove the local `const`.
3. Update `src/types/index.ts` — remove the local `MAX_BODY_CHARS` const (now in `limits.ts`).
4. Update `src/lib/ai.ts` — change `const MAX_PROMPT_FIELD_LEN = 300` to `import { MAX_PROMPT_FIELD_LEN } from '@/lib/limits'`.
5. Update CLAUDE.md "Key rules" to point at `src/lib/limits.ts` for all three constants.

**Why a new file (not `html-text.ts` or `types/index.ts`):** `html-text.ts` is HTML-extraction domain; mixing in unrelated caps confuses cohesion. `types/index.ts` is Zod schema land; constants belong in a sibling. A 6-line `limits.ts` is the right granularity for a module everyone imports from. (Pattern reviewer + architecture reviewer aligned on this.)

**Success criteria:** No direct cap constants outside `src/lib/limits.ts`; all three call sites import from there; CLAUDE.md reflects the consolidation; existing tests pass unchanged.

**Estimated effort:** ~15 minutes.

#### Phase 1: Foundation — `safeSlice` helper

**Tasks:**
1. Create `src/lib/safe-string.ts`. **No `import 'server-only'`** — pure string utility, follows the `html-text.ts` precedent (CLAUDE.md L34's "must import server-only" rule applies to modules with secrets; this has none).
2. Implement `safeSlice(s: string, max: number): string` — JSDoc style matches existing `//`-comment convention in `src/lib/html-text.ts` and `src/lib/ai.ts` (pattern reviewer note: codebase uses `//` not `/** */`):
   ```ts
   // src/lib/safe-string.ts
   //
   // Slices `s` to at most `max` UTF-16 code units; never returns a string ending
   // in a lone high surrogate. Mid-string lone surrogates pass through unchanged —
   // this function fixes its own truncation, not the caller's data.
   //
   // Not grapheme-aware: a multi-codepoint emoji ZWJ sequence cut mid-sequence
   // may produce a different glyph (but always valid UTF-16). For LLM-input
   // capping that's the right trade-off — tokenizers see code points, not
   // user-perceived characters. Do NOT use Intl.Segmenter for this: it OOMs on
   // strings >40K chars (jonschlinkert/intl-segmenter).
   export function safeSlice(s: string, max: number): string {
     if (max < 0) throw new RangeError(`safeSlice: max must be >= 0, got ${max}`)
     if (max === 0 || s.length === 0) return ''
     if (s.length <= max) return s
     const lastCharCode = s.charCodeAt(max - 1)
     const isHighSurrogate = lastCharCode >= 0xD800 && lastCharCode <= 0xDBFF
     return s.slice(0, isHighSurrogate ? max - 1 : max)
   }
   ```
   **Why throw on negative max** (kieran): silent return swallows programmer bugs; `RangeError` matches the standard library shape (e.g., `String.prototype.normalize` throws on bad form).
3. Create `src/lib/__tests__/safe-string.test.ts` (test cases listed under Phase 4 below).

##### Research Insights — `safeSlice`

**Best Practices** (from best-practices research and explore-libraries):
- The `charCodeAt(max-1)` check on `[0xD800, 0xDBFF]` is the canonical low-level pattern; matches the fix Google adopted in [gemini-cli #22753](https://github.com/google-gemini/gemini-cli/issues/22753).
- Confirmed: write your own. `runes`, `grapheme-splitter`, `string-length` solve a *different* problem (graphemes vs surrogates). `lodash/truncate` is NOT surrogate-safe.
- **Anti-pattern**: `Array.from(s).slice(0, n).join('')` allocates the entire code-point array — fine for short strings, wrong for the 30K-char hot path here. `safeSlice` is O(1) extra beyond `String#slice`.
- **Don't use `Intl.Segmenter`**: V8's segmenter throws `RangeError: Maximum call stack size exceeded` on strings ≥40-50K chars (see [jonschlinkert/intl-segmenter](https://github.com/jonschlinkert/intl-segmenter)). Our `MAX_BODY_CHARS = 30_000` is uncomfortably close to the danger zone.
- **Anti-pattern**: `s.normalize('NFC')` *after* slicing — NFC can re-compose marks across the boundary, changing length unpredictably. If we ever add NFC, run it before slice.

**Success criteria:** all `safeSlice` tests pass; `safeSlice` never returns a string ending in `\uD800-\uDBFF`; helper compiles in TypeScript strict mode.

**Estimated effort:** ~30 minutes including tests.

#### Phase 2: Rename `sanitizeForPrompt` → `collapsePromptWhitespace`; strengthen its sanitization

**Why the rename** (architecture-strategist's strongest recommendation): after this PR, the cap inside the helper is explicitly demoted to "no longer load-bearing." Keeping the name "sanitize" perpetuates the original sin — future contributors will read it as the trust boundary and route caps will atrophy under refactoring pressure (the exact #146 failure mode). **Names are how trust boundaries become visible.** The rename is the architectural enforcement against the next regression.

**Tasks:**
1. In `src/lib/ai.ts`:
   - Import `safeSlice` from `@/lib/safe-string` and `MAX_PROMPT_FIELD_LEN` from `@/lib/limits`.
   - Rename and rewrite the helper:
     ```ts
     // Before (L84-86):
     export function sanitizeForPrompt(s: string): string {
       return s.slice(0, MAX_PROMPT_FIELD_LEN).replace(/[\n\r\t]/g, ' ')
     }

     // After:
     // Whitespace-collapses and bidi-strips a string for plain-text prompt context.
     // NOT a trust boundary — caps are enforced at the route. Defense-in-depth:
     // throws if the input is over the cap (the route should have already capped it).
     const ZERO_WIDTH_AND_BIDI = /[​-‏‪-‮⁦-⁩﻿]/g
     export function collapsePromptWhitespace(s: string): string {
       if (s.length > MAX_PROMPT_FIELD_LEN) {
         throw new RangeError(
           `collapsePromptWhitespace: input length ${s.length} exceeds MAX_PROMPT_FIELD_LEN (${MAX_PROMPT_FIELD_LEN}). ` +
           `The route boundary should have capped this — calling helper with uncapped input is a trust-boundary violation.`,
         )
       }
       return s
         .replace(/[\s  ]+/g, ' ')   // all whitespace categories incl. line/paragraph separators
         .replace(ZERO_WIDTH_AND_BIDI, '')     // strip zero-width + bidi-override (prompt-injection vectors)
         .trim()
     }
     ```
2. Update all `sanitizeForPrompt` callers in `src/lib/ai.ts` (formatPostsForCuration L92-96, the selectedCourse path callers in route.ts L69-77).
3. **Order is still load-bearing** — but now enforced by the assertion *and* the route having already capped. The test pins both: route-capped value reaches the helper at ≤ `MAX_PROMPT_FIELD_LEN` (assertion never fires in production), and the assertion *would* fire if a future regression bypassed the route cap.

**Why the throw is defense-in-depth, not silent re-truncation** (best-practices research; OWASP LLM Top 10 2025): silent re-truncation hides regressions. A cheap invariant assertion makes the trust-boundary contract loud — exactly what the postmortem `docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md` recommends.

**Why the stronger regex matters:**
- `/[\n\r\t]/g` misses ` ` (NBSP), ` ` (LINE SEPARATOR), ` ` (PARAGRAPH SEPARATOR), `﻿` (BOM/ZWNBSP). LLM tokenizers handle these inconsistently.
- **`‪-‮` (bidi-override) and `⁦-⁩` (isolate) chars are documented prompt-injection vectors** — see [Rafter — Prompt Injection 101](https://rafter.so/blog/prompt-injection-101). They render text in reverse or isolated direction, fooling humans reviewing prompt logs and bypassing semantic filters.
- `​-‏` (zero-width chars) hide markers in text the LLM still sees.

4. Create `src/lib/__tests__/ai-collapse-prompt-whitespace.test.ts` (naming matches the existing `src/__tests__/ai-filename.test.ts` precedent rather than starting a new pattern).

**Success criteria:**
- `collapsePromptWhitespace` throws on input > `MAX_PROMPT_FIELD_LEN`
- 400 newlines + 50 ASCII chars → output is ≤ `MAX_PROMPT_FIELD_LEN` and contains no consecutive whitespace
- Bidi-override `‮` is stripped
- Zero-width `​` is stripped
- NBSP ` ` is collapsed to single space
- All existing tests still pass after the rename (curation prompt formatting unchanged)

**Estimated effort:** ~45 minutes including the new test file and rename sweep.

#### Phase 3: Cap fields at the route boundary (the actual #162 fix — corrected)

**Tasks:**
1. In `src/app/api/curate/route.ts`:
   - Import `safeSlice` from `@/lib/safe-string` and `MAX_PROMPT_FIELD_LEN`/`MAX_BODY_CHARS`/`MAX_POST_WORDS` from `@/lib/limits`.
   - Replace the `posts.map` block (`L30-36`):
     ```ts
     // Trust boundary: cap every field that reaches the LLM, with a UTF-16-safe slice.
     // - title/subtitle/excerpt: short-form; same cap collapsePromptWhitespace asserts downstream.
     // - bodyText: word-cap is the LLM-budget gate; char cap is the DoS bound (now generous
     //   enough that the word cap is the binding constraint for typical English).
     const posts = body.posts.map(p => ({
       ...p,
       title:    safeSlice(p.title, MAX_PROMPT_FIELD_LEN),
       subtitle: p.subtitle === null ? null : safeSlice(p.subtitle, MAX_PROMPT_FIELD_LEN),
       excerpt:  safeSlice(p.excerpt, MAX_PROMPT_FIELD_LEN),
       bodyText: truncateTextToWords(
         safeSlice(p.bodyText, MAX_BODY_CHARS),
         MAX_POST_WORDS,
       ),
     } satisfies SubstackPost))
     ```
     Notes:
     - **Drop the `typeof p.bodyText === 'string'` guard**: Zod has already validated. (Closes #176 incidentally.)
     - **Use `=== null`, not `== null`**: `SubstackPostSchema.subtitle` is `.nullable()`, not `.nullish()` — `undefined` would fail Zod and never reach this code.
     - **`satisfies SubstackPost`** (kieran): catches future field rename in the schema without losing inferred narrowness.
   - Add `selectedCourse` field caps **at field-specific Zod maxes**, NOT blanket 300 (this corrects the original plan — see Enhancement Summary). After the existing slug cross-reference guard (`L39-50`) — guard validates raw structure first, then we normalize:
     ```ts
     // Same trust-boundary discipline for selectedCourse fields that flow into
     // rewrite prompts via xmlEscape. Each field caps at its existing Zod max
     // (UTF-16 safety only; we are NOT silently shortening any field's allowed length).
     // NEVER touch slug — must round-trip into postsBySlug.get below.
     const selectedCourse = body.selectedCourse ? ({
       ...body.selectedCourse,
       courseTitle:       safeSlice(body.selectedCourse.courseTitle,       60),   // matches CuratedSelectionSchema
       courseDescription: safeSlice(body.selectedCourse.courseDescription, 500),  // matches CuratedSelectionSchema
       targetAudience:    safeSlice(body.selectedCourse.targetAudience,    200),  // matches CuratedSelectionSchema
       overallRationale:  safeSlice(body.selectedCourse.overallRationale,  500),  // matches CuratedSelectionSchema
       lessons: body.selectedCourse.lessons.map(l => ({
         ...l,
         lessonFocus:        safeSlice(l.lessonFocus,        300),  // matches CuratedLessonSchema
         selectionRationale: safeSlice(l.selectionRationale, 300),  // matches CuratedLessonSchema
       })),
     } satisfies CuratedSelection) : undefined
     ```
     **Why field-specific caps, not 300 blanket** (security + simplicity reviewers agreed): the original plan would silently shorten `courseDescription`/`overallRationale` from Zod's allowed 500 to 300. `safeSlice`'s purpose here is UTF-16 safety, not cap-tightening. If we want to tighten the actual caps to 300, that's a separate decision (and a Zod schema change, not a route mutation).
   - **Optional refinement** (kieran + architecture, score: nice-to-have): extract the selectedCourse normalization into a route-local `normalizeSelectedCourse(sc): CuratedSelection` helper to keep the route's `start()` lambda focused on stream orchestration.
2. In `src/lib/limits.ts` (created in Phase 0):
   - `MAX_BODY_CHARS = 30_000 as const` (was `15_000`).
3. CLAUDE.md "Key rules" section already updated in Phase 0; nothing more here.

##### Phase 3b: Apply identical normalization to `/api/propose-courses`

**NEW** — security-sentinel surfaced this. Same `posts: SubstackPost[]` shape, same `formatPostsForCuration` builder, same gap.

1. In `src/app/api/propose-courses/route.ts`:
   - Import `safeSlice`, `MAX_PROMPT_FIELD_LEN`, `MAX_BODY_CHARS`, `MAX_POST_WORDS`, `truncateTextToWords` exactly as in `/api/curate`.
   - Apply the same `posts.map` normalization. Note: this route uses `SubstackPostSchema.pick({...})` — confirm the picked fields match what `formatPostsForCuration` reads, and only normalize those.
2. Add a regression test mirroring `curate-route-word-cap.test.ts` (smaller scope — propose-courses doesn't have a `selectedCourse` branch).

**Estimated effort:** ~30 minutes (pure pattern replication).

##### Phase 3c: Cap `priorLessons` (close the second-order injection path)

**NEW** — security-sentinel surfaced this as a P1 missed surface. `parseLessonMarkdown` (`src/lib/ai.ts:428-438`) extracts `title` and `keyTakeaway` from the rewrite LLM's streaming output with no length cap. Those become `priorLessons` context in subsequent rewrite prompts (xml-escaped but uncapped). An adversarial `bodyText` can induce the rewrite LLM to emit a 5000-char title, amplifying cost across the loop.

**Tasks:**
1. In `src/lib/ai.ts:428-438` (`parseLessonMarkdown`), wrap `title` and `keyTakeaway` in `safeSlice(...)`:
   ```ts
   import { safeSlice } from '@/lib/safe-string'
   import { MAX_PROMPT_FIELD_LEN } from '@/lib/limits'
   // ...
   const title = safeSlice(titleMatch?.[1]?.trim() ?? '', MAX_PROMPT_FIELD_LEN)
   const keyTakeaway = safeSlice(keyTakeawayMatch?.[1]?.trim() ?? '', MAX_PROMPT_FIELD_LEN)
   ```
2. Verify `subjectLine` (50) and `previewText` (90) caps are also `safeSlice`-based, not raw `.slice` — fix if not.
3. Add test in extended `curate-route-word-cap.test.ts` (or new `ai-parse-lesson-markdown.test.ts`): inject a mocked `rewriteAsLesson` that emits a 5000-char `**Key takeaway:**` line; assert `parseLessonMarkdown`'s output `keyTakeaway.length <= MAX_PROMPT_FIELD_LEN`.

**Estimated effort:** ~20 minutes.

##### Phase 3d: Reduce `bodyHtml` schema cap

**NEW** — security-sentinel surfaced this as the *real* DoS surface. `SubstackPostSchema.bodyHtml.max(500_000)` × 50 posts = 25 MB attacker-controllable peak per request, and `bodyHtml` is unused in `/api/curate` and `/api/propose-courses`.

**Two implementation options:**

**Option A (cleanest):** Split the schema. `SubstackPostInputSchema` (no `bodyHtml`) for `/api/curate` and `/api/propose-courses`; `SubstackPostFullSchema` (with `bodyHtml.max(50_000)`) for `/api/fetch-posts`'s output type only.

**Option B (minimal):** Drop `bodyHtml.max` to `50_000` everywhere.

Recommend Option A — `bodyHtml` reaching `/api/curate` is dead data that doesn't need to traverse the wire at all. The UI doesn't send it (per pattern reviewer).

**Estimated effort:** ~15 minutes (Option B), ~30 minutes (Option A).

##### Total Phase 3 success criteria:
- All four fields capped on input posts in both `/api/curate` and `/api/propose-courses`
- `selectedCourse` fields capped at their Zod maxes (not blanket 300); `slug` never sliced
- `priorLessons[*].title` and `keyTakeaway` capped at parse time
- `bodyHtml` either removed from curate/propose schemas or capped at 50K
- `MAX_BODY_CHARS = 30_000`; `MAX_PROMPT_FIELD_LEN` and others all live in `src/lib/limits.ts`
- All `enqueue(...)` calls in route's `start()` lambda gain `satisfies CurateSSEEvent` (kieran's bonus hygiene catch)

**Total Phase 3 effort:** ~2 hours (was ~1; new sub-phases add scope).

##### Research Insights — Trust-boundary input normalization

**OWASP LLM Top 10 2025:**
- **LLM01: Prompt Injection** ([genai.owasp.org](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)) — endorses layered validation: "strict validation of user inputs before they reach the LLM" + "post-processing of LLM outputs" + content separation. Multi-layer is the recommendation, not single-layer.
- **LLM10: Unbounded Consumption** ([genai.owasp.org](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/)) — the actual threat-model frame for length caps. "Continuously sending inputs that exceed the LLM's context window" is the cost-DoS vector. Per-field caps are LLM10 defenses; the prompt-injection framing is secondary.

**Vercel guidance:**
- [Building Secure AI Agents](https://vercel.com/blog/building-secure-ai-agents) — "assume the attacker controls the entire prompt." Validate at the trust boundary; helpers inside the boundary should `assert` invariants, not silently re-truncate.
- [CVE-2025-48985](https://vercel.com/changelog/cve-2025-48985-input-validation-bypass-on-ai-sdk) — Vercel AI SDK input-validation bypass: missing boundary-layer validation, helper-layer fix didn't help. Validates the "cap at boundary" position.

**Anthropic guidance:**
- [Mitigate jailbreaks and prompt injections](https://platform.claude.com/docs/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks) — recommends pre-screening with Claude Haiku as a structural defense. Anthropic does NOT prescribe specific byte limits; their focus is semantic risk (harmlessness screen). Length caps are an operational concern, not a content-safety one.

**Real-world incidents (2024-2026):**
- **EchoLeak (CVE-2025-32711)** — Microsoft 365 Copilot zero-click prompt injection via email body. Fix: server-side patching. *Lesson*: "system prompts" without input boundary enforcement are insufficient.
- **Cursor IDE (CVE-2025-54135/54136)** — once-approved MCP configs trusted permanently after modification. *Lesson*: re-validate every request, not cached trust.

**Cap-then-collapse ordering (from UAX #15 §1.3):** any operation that *can* shorten a string (whitespace collapse, NFC composition, zero-width strip) must run *after* a hard size cap if the cap is a security/quota invariant. Otherwise the cap is a soft suggestion. Confirms the order in `collapsePromptWhitespace`. (Also: [dasroot.net middleware pattern, Feb 2026](https://dasroot.net/posts/2026/02/building-middleware-layer-prompt-injection-defense/) orders ops as: length cap → NFC normalize → strip zero-width/bidi → collapse whitespace. Cap is always step 1.)

#### Phase 4: Test extension

**Framework versions** (framework-docs research): repo uses `vitest@^4.1.4`, `next@16.1.6`, `zod@^4.3.6`, no `fast-check`. Patterns below match these.

##### Research Insights — Vitest 4.x current idioms

**`vi.hoisted` + `vi.mock(import('...'), ...)` is the canonical Vitest 4 pattern** ([docs](https://vitest.dev/api/vi.html#vi-hoisted)). The repo's existing test uses the legacy "factory references module-level vars" idiom; it works because the factory is lazily invoked. The plan does NOT rewrite the existing test (avoid scope creep), but new test files should use the current pattern:

```ts
import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  curatePostSelection: vi.fn(),
  rewriteAsLesson: vi.fn(),
  parseLessonMarkdown: vi.fn(),
  collapsePromptWhitespace: vi.fn((s: string) => s),
}))

vi.mock(import('@/lib/ai'), () => mocks)

beforeEach(() => {
  vi.resetModules()
  Object.values(mocks).forEach(m => m.mockReset?.())
})
```

**Property-style tests:** `fast-check` is not installed; not adding it for this PR. `it.each([...])` covers ~80% of what fast-check would shrink to with hand-picked edge cases — fine here.

**Streaming route test:** `await POST(request)` then `await res.text()` to drain is correct for SSE handlers. For chunk-by-chunk assertions, use `res.body!.getReader()` + `TextDecoder`. `NextRequest` is required only when the route reads `nextUrl`/cookies/geo; plain `new Request(...)` works for `req.json()`-only handlers.

**Tasks:**
1. **`src/lib/__tests__/safe-string.test.ts`** (new file). Cases:
   - `safeSlice('', 5) === ''`
   - `safeSlice('abc', 0) === ''`
   - `safeSlice('abc', -1) === ''`
   - `safeSlice('abc', 10) === 'abc'` (max > length)
   - `safeSlice('abcdef', 3) === 'abc'` (ASCII cut)
   - `safeSlice('a😀b', 2)` — ASCII + start of emoji surrogate; result has length 1 (`'a'`), no lone surrogate
   - `safeSlice('a😀b', 3)` — cut between high and low surrogate; result has length 1 (drops the high surrogate), not 3
   - `safeSlice('😀😀😀', 2)` — drops the 2nd high surrogate, result has length 0 or 2 valid emoji depending on alignment (test the actual alignment)
   - `safeSlice('a\uD800b', 5)` — input contains a mid-string lone surrogate; passed through unchanged (we don't sanitize what we didn't break)
   - Property check: `safeSlice(s, max).length <= max` for any `s, max`
   - Property check: `safeSlice(s, max)` never ends with a code unit in `[0xD800, 0xDBFF]`

2. **`src/lib/__tests__/sanitize-for-prompt.test.ts`** (new file). Cases:
   - 400-char ASCII input → returns 300 chars
   - 400 newlines input → returns 300 spaces (asserts cap-then-replace order, not replace-then-cap)
   - Emoji pad at boundary → no lone surrogate in output
   - Tab + CR + LF mix → all become single spaces
   - Empty input → empty output

3. **Extend `src/__tests__/curate-route-word-cap.test.ts`** with seven new cases (the original five plus two added by deepening review):
   - **`selectedCourse` branch — bodyText word cap regression** (the #169 fix). 4000-word `bodyText` + minimal `selectedCourse` with one lesson; assert `rewriteAsLesson` mock receives a `post` whose `bodyText.split(/\s+/).filter(Boolean).length <= MAX_POST_WORDS`.
   - **Auto-curation branch — title/subtitle/excerpt cap.** Input post with `title`, `subtitle`, `excerpt` each at 1000 chars; assert `curatePostSelection` mock receives `posts[0].title.length <= MAX_PROMPT_FIELD_LEN` (and same for subtitle/excerpt).
   - **`selectedCourse` branch — courseTitle/courseDescription cap at field-specific Zod max.** Input `selectedCourse` with 1000-char fields; assert `rewriteAsLesson`'s `selection` arg has `courseTitle.length <= 60`, `courseDescription.length <= 500`, etc. (NOT all ≤ 300 — that would mask the corrected behavior.)
   - **Surrogate-boundary `bodyText`.** Construct input where the char at `MAX_BODY_CHARS - 1` is a high surrogate; assert `curatePostSelection`/`rewriteAsLesson` receives no `\uD8XX` substring.
   - **`MAX_BODY_CHARS = 30_000` rebalance.** 30k-char ASCII `bodyText` (≈ 5,000 words at avg 6 chars/word): assert word cap binds (output ≤ 2500 words).
   - **NEW: Cap fires BEFORE `collapsePromptWhitespace`.** This is the regression-detection test the postmortem demands. Mock `collapsePromptWhitespace` to throw if it ever receives an input over `MAX_PROMPT_FIELD_LEN`; submit a 1000-char `title`; assert no throw (i.e., the route capped first). A future regression that moves the cap back into the helper would fail this test loudly. (Security-sentinel raised this gap.)
   - **NEW: priorLessons cap.** Mock `rewriteAsLesson` to emit a 5000-char `**Key takeaway:**` line on the first lesson; on the second lesson, assert `priorLessons` argument has `keyTakeaway.length <= MAX_PROMPT_FIELD_LEN`.

4. **NEW**: parallel test file for `/api/propose-courses` (Phase 3b). Smaller scope — no `selectedCourse`, no priorLessons. Three cases: bodyText cap, title/subtitle/excerpt cap, surrogate boundary.

5. **NEW (Phase 5b)**: prelude latency canary. Submit 50 posts × 30k char `bodyText`; assert that the time from `await POST(request)` returning to the first SSE event is < 100 ms (generous but catches a 10× regression). This is the canary the original integration scenario #3 should have had — "doesn't OOM" doesn't catch latency regressions inside `maxDuration = 180s`.

6. Keep the existing identity mock for the renamed `collapsePromptWhitespace` in the test file — caps are now applied at the route, so the mock boundary still observes capped values. Type the mock with `satisfies` for hygiene:
   ```ts
   collapsePromptWhitespace: ((s: string) => s) satisfies (s: string) => string,
   ```

**Success criteria:**
- All new tests pass
- Existing 2 word-cap tests pass unchanged
- `vitest run src/lib/__tests__/safe-string.test.ts src/lib/__tests__/sanitize-for-prompt.test.ts src/__tests__/curate-route-word-cap.test.ts` is green

**Estimated effort:** ~1.5 hours.

## Alternative Approaches Considered

### Alt 1: Tighten Zod schemas instead of route-level caps

Drop `SubstackPostSchema.title.max(500)` to `.max(300)`, same for `subtitle` and `excerpt`. No route-level code change.

- **Pros:** Single point of validation; Zod errors are loud and observable.
- **Cons:** Validation rejects rather than truncates — surface change for any agent caller currently sending 301-500 char fields. The original `bodyText` fix (#146) chose truncation over rejection for the same reason. Breaking-change asymmetry.
- **Rejected because:** the established pattern is "truncate at the boundary." Consistency wins.

### Alt 2: Cap inline at every `ai.ts` call site

Wrap each `${sanitizeForPrompt(p.title)}` with an explicit cap. Don't move enforcement to the route.

- **Pros:** Zero route changes; cap lives next to the prompt that needs it.
- **Cons:** Distributes the trust boundary across every prompt-building function. Exactly the shape #146 was filed to fix. Future prompts that forget the cap silently re-open the bypass.
- **Rejected because:** trust-boundary contracts belong at the boundary, not at usage sites.

### Alt 3: Slice by code points (`Array.from(s).slice(0, max).join('')`)

Bypass the surrogate problem entirely by converting to a code-point array first.

- **Pros:** Cleanest mental model; preserves the partial emoji's high half by lifting to a higher abstraction.
- **Cons:** Allocates an entire code-point array (~2× memory peak). At 30k chars per post × 50 posts = 6 MB peak per request — non-trivial. `safeSlice` is O(1) extra space.
- **Rejected because:** `safeSlice`'s cost is one `charCodeAt` call; `Array.from` is far heavier for a problem with such a small fix.

### Alt 4: Defer the `selectedCourse`-field cap to a follow-up PR

Ship #162/#167/#168/#169 as named, leave selectedCourse field caps for later.

- **Pros:** Smaller PR, narrower scope.
- **Cons:** Same trust-boundary gap, just on a different branch. If we leave it, we ship a defense that's symmetric in test coverage but asymmetric in code — exactly the inspection-vs-test mismatch PR #17 was filed to prevent.
- **Rejected because:** this PR's whole job is *closing* the trust boundary. Half-closing it now means a third PR later.

### Alt 5: Branded types for sanitized strings (recommended follow-up)

Make the trust boundary compiler-enforced via nominal typing:

```ts
// src/lib/safe-string.ts
declare const __sanitized: unique symbol
export type SanitizedPromptField = string & { readonly [__sanitized]: true }

export function safeSlice(s: string, max: number): SanitizedPromptField {
  // ... existing impl, returning result `as SanitizedPromptField`
}
```

Then prompt builders' signatures accept only `SanitizedPromptField`:
```ts
function formatPostsForCuration(posts: { title: SanitizedPromptField, ... }[]): string
```

- **Pros:** Compiler-enforced; future contributor cannot pass an uncapped string to the prompt builder. The sharpest possible architectural defense — exactly the [Superagent guardrails SDK](https://github.com/superagent-ai/ai-sdk) pattern and what Vercel AI SDK 6 adopted internally after CVE-2025-48985.
- **Cons:** Spreads the brand across every prompt-bound field signature in `ai.ts`. Doubles the PR's mechanical change footprint. `SubstackPost.title` becomes `SanitizedPromptField` only after the route normalizes — needs a sibling type for "raw inbound" vs "normalized."
- **Defer because:** the rest of this PR already lands the runtime contract (route caps + helper assertion + tests). Branded types make a future regression *impossible*; the runtime contract makes it *loud*. Loud is good enough for ship #1; impossible is the right follow-up.

### Alt 6: Push the cap into Zod via `.transform()`

Zod 4.3.6 (current in repo) supports clean schema-level transformation:

```ts
const SubstackPostSchema = z.object({
  title:    z.string().max(500).transform(s => safeSlice(s, MAX_PROMPT_FIELD_LEN)),
  bodyText: z.string().max(100_000).transform(s => truncateTextToWords(safeSlice(s, MAX_BODY_CHARS), MAX_POST_WORDS)),
  // ...
})
```

After `safeParse`, `body.posts[i].bodyText` is already capped. The route's `posts.map` becomes unnecessary.

- **Pros:** Single point of enforcement, expressed declaratively. Removes the "validate then post-process" two-step.
- **Cons:** Changes `safeParse` semantics from "tell me if input is valid" to "validate AND mutate." Less ergonomic for surfacing the cap in error responses (caller can't tell from `safeParse.success === true` whether their input was reshaped). Plan #171 is exactly about making this observable; mixing the cap into `safeParse` makes that harder.
- **Rejected because:** keeping the schema descriptive (validation only) and the route imperative (normalization) is more honest about what's happening. Worth revisiting once #171 lands.

### Alt 7: Split into two PRs (raised by code-simplicity-reviewer)

Ship `posts`-fields caps as PR-A; `selectedCourse` + `priorLessons` + `propose-courses` as PR-B.

- **Pros:** Smaller blast radius per PR; each independently reviewable.
- **Cons:** Each PR is still ~50-80 lines; the "smaller blast radius" gain is marginal for code that touches the same trust boundary. Splitting doubles CI cycles and review iterations. The whole PR's purpose is symmetric trust-boundary completion; splitting reproduces the asymmetry the postmortem warned about.
- **Rejected because:** the work *is* one coherent unit (same boundary, same helper, same tests). Two PRs ship two partial fixes; one PR ships a complete one.

## System-Wide Impact

### Interaction Graph

When a `POST /api/curate` request lands:

1. `route.ts:21` — Zod `.safeParse` validates structure (existing).
2. `route.ts:30-36` (NEW shape) — `posts.map` applies `safeSlice` to `title/subtitle/excerpt` and the existing `truncateTextToWords ∘ safeSlice` chain to `bodyText`. **Synchronous, cannot throw.**
3. `route.ts:39-50` — slug cross-reference guard (unchanged). Operates on the already-truncated `posts.map(p => p.slug)` — slugs are never sliced, so the guard sees the same values as the input.
4. `route.ts:NEW` — `selectedCourse` field map normalizes `courseTitle`/etc. via `safeSlice`. **Synchronous, cannot throw.**
5. `route.ts:54` onward — opens SSE stream; from here errors are caught by the `start()` try/catch and emitted as `error` events.

The new code is entirely in the synchronous prelude. Any throw becomes a 500 (no SSE frame). `safeSlice` cannot throw on any string input — verified by the test matrix.

### Error & Failure Propagation

- `safeSlice` throws on non-string input. Zod has already validated everything to `string` (or `null` for `subtitle`); the route's `=== null` guard handles the only nullable case. No new failure mode.
- `truncateTextToWords` is unchanged.
- `sanitizeForPrompt` swap to `safeSlice` is behavior-equivalent for ASCII; for emoji-padded input it returns ≤ 300 chars instead of 300 chars sometimes containing a lone surrogate. No call site checks for "exactly 300 chars" — verified by grep.

### State Lifecycle Risks

None. All changes operate on in-memory request data; no persistence, no caching, no observers. The route's stream lifecycle (open → enqueue → close) is unchanged.

### API Surface Parity

- **`/api/fetch-posts`** (`src/app/api/fetch-posts/route.ts`): does not yet apply `MAX_PROMPT_FIELD_LEN` to its output `posts[*].title/subtitle/excerpt` because it returns Substack's strings as-is. Callers that pipe `/api/fetch-posts` output → `/api/curate` (the UI) will get the curate route's normalization for free. **No parity work needed unless we want fetch-posts to pre-truncate** — which would be #170 (double-truncation fast path), not in this plan's scope.
- **`/api/propose-courses`** (`src/app/api/propose-courses/route.ts`): also takes `posts: SubstackPost[]` and feeds an LLM prompt. **Worth auditing for the same gap** (out of this PR's scope; file as a follow-up if found).
- **`/api/export`**: does not call the LLM; not affected.

### Integration Test Scenarios

Beyond the unit-style cases above, three cross-layer scenarios that mocking would miss:

1. **Real `sanitizeForPrompt` + new `safeSlice` together** — assert that an emoji-padded 400-char `title` survives Zod, gets sliced by route to ≤ 300 chars with no lone surrogate, then passes through `sanitizeForPrompt` (which would itself slice but find nothing to do) and reaches `formatPostsForCuration` as a clean string. Could be written as a test that does NOT mock `sanitizeForPrompt`.
2. **`selectedCourse` round-trip** — submit a `selectedCourse` with attacker-shaped `courseTitle` (long + emoji + injection-attempt newlines), assert the `selection` SSE event payload is normalized.
3. **`MAX_BODY_CHARS = 30_000` does not OOM** — submit 50 posts × 30k char `bodyText` and assert the route returns 200 within `maxDuration`. (Likely fine; worth a one-off check.)

## Acceptance Criteria

### Functional Requirements

- [ ] `src/lib/limits.ts` exists and is the sole source of `MAX_PROMPT_FIELD_LEN`, `MAX_BODY_CHARS`, `MAX_POST_WORDS` (each declared `as const`)
- [ ] `safeSlice(s, max)` is implemented in `src/lib/safe-string.ts` and exported
- [ ] `safeSlice` throws `RangeError` on negative `max`
- [ ] `safeSlice` never returns a string ending in a UTF-16 high-surrogate code unit (`0xD800-0xDBFF`)
- [ ] `safeSlice(s, max).length <= max` for every non-negative `max`
- [ ] `sanitizeForPrompt` is renamed to `collapsePromptWhitespace` (every callsite updated)
- [ ] `collapsePromptWhitespace` throws `RangeError` if input length exceeds `MAX_PROMPT_FIELD_LEN` (defense-in-depth assertion, not silent re-truncation)
- [ ] `collapsePromptWhitespace` collapses NBSP/U+2028/U+2029 along with ASCII whitespace
- [ ] `collapsePromptWhitespace` strips zero-width (`U+200B-U+200F`, `U+FEFF`) and bidi-override (`U+202A-U+202E`, `U+2066-U+2069`) chars
- [ ] `/api/curate` route applies `safeSlice` to `title`, `subtitle` (when non-null), `excerpt` (at `MAX_PROMPT_FIELD_LEN`) and `bodyText` (at `MAX_BODY_CHARS`, then through `truncateTextToWords`) in both auto-curation and `selectedCourse` branches
- [ ] `/api/curate` route applies `safeSlice` to `courseTitle` (60), `courseDescription` (500), `targetAudience` (200), `overallRationale` (500), `lessonFocus` (300), `selectionRationale` (300) on `selectedCourse` when provided — using **field-specific Zod maxes**, not blanket 300
- [ ] `/api/curate` route NEVER slices `slug` fields (must round-trip into `postsBySlug.get`)
- [ ] **NEW: `/api/propose-courses` applies the same posts normalization** (Phase 3b)
- [ ] **NEW: `parseLessonMarkdown` caps `title` and `keyTakeaway` at `MAX_PROMPT_FIELD_LEN` via `safeSlice`** (Phase 3c)
- [ ] **NEW: `SubstackPostSchema.bodyHtml` cap reduced** (Option A: split schema with no `bodyHtml` for curate/propose; Option B: cap at 50K everywhere)
- [ ] `MAX_BODY_CHARS = 30_000` (raised from 15_000)
- [ ] CLAUDE.md "Key rules" updated to point at `src/lib/limits.ts` for all three constants
- [ ] `posts.map` block has `satisfies SubstackPost`; `selectedCourse` map has `satisfies CuratedSelection`; `enqueue(...)` calls have `satisfies CurateSSEEvent` (kieran)

### Non-Functional Requirements

- [ ] No measurable latency regression on typical 50-post requests (`safeSlice` is O(1) extra work per field)
- [ ] No new `import 'server-only'` requirement (the new helper is pure-string utility)
- [ ] Tests run in < 5s for the new files combined

### Quality Gates

- [ ] All existing tests still pass (`npm test`)
- [ ] New `safe-string.test.ts` covers the 11+ cases listed in Phase 4 (incl. negative-max throws `RangeError`)
- [ ] New `ai-collapse-prompt-whitespace.test.ts` pins: throws on over-cap input, collapses all whitespace categories, strips zero-width + bidi-override, ASCII pad → trimmed output
- [ ] Extended `curate-route-word-cap.test.ts` covers the 7 new scenarios (incl. cap-fires-before-helper, priorLessons cap)
- [ ] New `propose-courses-word-cap.test.ts` mirrors the relevant curate cases for the propose route
- [ ] Prelude latency canary < 100ms for 50 × 30k posts
- [ ] No `eslint --max-warnings 0` warnings
- [ ] Code review notes #146-style "trust boundary owns the contract" framing

## Success Metrics

- **Defense surface:** Direct API caller cannot inject > `MAX_PROMPT_FIELD_LEN` chars into any prompt-bound field reaching the LLM, regardless of which branch they take.
- **Test pinning:** A future refactor that moves cap enforcement back into `sanitizeForPrompt` causes a test failure at the route boundary (the contract is pinned where it lives, not where it was).
- **No regression:** UI happy-path latency unchanged; existing 13 html-text tests + 2 word-cap tests pass without modification.

## Dependencies & Prerequisites

- None external. All changes are within the repo.
- Implicitly closes incidental issues: #168 (UTF-16 surrogate), part of #176 (typeof guard removed).
- Depends on `truncateTextToWords` and `MAX_POST_WORDS` from `src/lib/html-text.ts` (already in place).

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `safeSlice` edge case missed (e.g., grapheme cluster splits change emoji rendering) | Medium | Low | Document explicitly as out-of-scope ("not grapheme-aware"); test matrix covers code-unit edge cases that matter for prompt safety |
| Raising `MAX_BODY_CHARS` to 30k creates memory pressure on 50-post requests | Low | Low | **Corrected accounting (perf-oracle):** real peak is closer to ~12 MB per request (Zod parse + `safeSlice` + `truncateTextToWords` allocations + `JSON.parse` retention), not 1.5 MB. Still well under Vercel function memory limits. Latency canary in tests (Phase 5b) catches regressions |
| `selectedCourse` field cap silently shortens a previously-allowed value | Low | High | **Original plan had this risk** — fixed by switching to field-specific Zod-max caps in Phase 3. `safeSlice` is now UTF-16 safety only; no cap-tightening happens silently |
| `priorLessons` cap (Phase 3c) breaks an existing test that assumes uncapped `keyTakeaway` | Very Low | Low | No existing test reads `keyTakeaway.length`; new `parseLessonMarkdown` tests assert the cap |
| `bodyHtml` schema reduction breaks `/api/fetch-posts` consumer expectations | Very Low | Low | If using Option A (split schema), `/api/fetch-posts` keeps the larger cap. If Option B (drop cap everywhere), audit shows no consumer reads >50K chars |
| `MAX_PROMPT_FIELD_LEN` drift between modules | Very Low | Medium | **Closed by Phase 0** — single source of truth in `src/lib/limits.ts`. No longer a deferred concern |
| `collapsePromptWhitespace` rename breaks an external caller | Very Low | Low | All callers are in `src/`; rename is a same-PR sweep with the compiler verifying every callsite. Add a `// @deprecated alias` for one release if any external doc references the old name |
| Test mock of (renamed) `collapsePromptWhitespace` (identity passthrough) becomes misleading once route owns the cap | Low | Low | Tests assert at the `curatePostSelection` / `rewriteAsLesson` mock boundary, where the route's caps have already been applied. Mock identity remains correct. New "cap-fires-before-helper" test (Phase 4) explicitly catches the inversion |
| Bidi-override / zero-width strip in `collapsePromptWhitespace` removes legitimate content from a non-English Substack | Low | Low | Bidi-override and zero-width chars are vanishingly rare in normal Substack content; their removal from prompt context does not affect the LLM's ability to reason about the text. (LLM tokenizers don't treat them as semantic markers.) |

## Resource Requirements

- **One developer**, one focused day. ~3 hours coding + ~1 hour test extension + ~1 hour CLAUDE.md / PR description / review iteration.
- No infrastructure, no third-party changes.

## Future Considerations

- **Branded types for sanitized strings** (Alt 5) — compiler-enforced trust boundary via `type SanitizedPromptField = string & { __sanitized: true }`. Sharpest possible defense; Vercel AI SDK 6 / Superagent pattern. Defer one PR so this PR ships a runtime contract that's already loud about regressions.
- **Push caps into Zod via `.transform()`** (Alt 6) — Zod 4.3.6 supports it cleanly. Revisit after #171 (`input_normalized` SSE event) lands; that change will reshape what "validation" means at the boundary.
- **`safeSlice` adoption sweep** — `src/lib/ai.ts:432, 435`, `src/lib/export.ts:11-12`, `src/app/api/export/route.ts:34`, `src/lib/substack.ts:82` are other `.slice(0, N)` call sites on user/LLM-controlled strings. Each should adopt `safeSlice` in a follow-up. None are exploitable today (most operate on regex-bounded slug-like content), but the consistency win is real.
- **Lint enforcement of the trust boundary** (best-practices research) — [`eslint-plugin-vercel-ai-security`](https://www.npmjs.com/package/eslint-plugin-vercel-ai-security) covers OWASP LLM Top 10 2025 and could lint-enforce that no untrusted string reaches `messages.create` without passing through `safeSlice`. Consider adding to lint config in a follow-up.
- **Grapheme-cluster-aware truncation** — out of scope here; would matter if we ever truncate user-visible text (we don't — these are LLM-input strings).
- **Unicode NFC normalization at the boundary** — UAX #15 §1.3 implies it should run *before* the cap (NFC can re-compose marks across boundaries). Not needed today (Substack content is already NFC); revisit if we ever accept user-typed input directly.
- **`/api/limits` discovery endpoint (#173)** — once `src/lib/limits.ts` exists (Phase 0), exposing it as a JSON endpoint is trivial. Direct extension of this work.

## CLAUDE.md Discipline Update

After this PR lands, add to "Key rules":

> Any route handler that forwards user input to `src/lib/ai.ts` MUST cap every string field at the boundary using `safeSlice` and the constants in `src/lib/limits.ts`. Helper functions in `src/lib/ai.ts` MUST assert (not silently re-truncate) when input exceeds the documented cap — silent re-truncation hides regressions like #146.

This is the architectural enforcement mechanism that survives this plan.

## Documentation Plan

- [ ] CLAUDE.md "Key rules" updated with the three constants and their owning modules
- [ ] PR description references `docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md` as the lesson this PR honors
- [ ] After merge, write `docs/solutions/security-issues/curate-route-trust-boundary-completion.md` capturing: the four findings, the design choice (truncate vs reject), the safeSlice helper rationale, and the cap-then-collapse order in `sanitizeForPrompt`

## Sources & References

### Internal References

- **Origin todos:**
  - `todos/162-pending-p1-curate-route-only-caps-bodytext-not-excerpt-title-subtitle.md`
  - `todos/167-pending-p2-max-body-chars-cuts-below-max-post-words.md`
  - `todos/168-pending-p2-utf16-surrogate-pair-split-in-body-slice.md`
  - `todos/169-pending-p2-selectedcourse-path-not-in-word-cap-regression-test.md`
- **Foundational solution doc:** `docs/solutions/security-issues/html-text-refactor-regressed-word-cap-and-paragraph-breaks.md` (the PR #17 postmortem; `MAX_POST_WORDS` trust-boundary lesson)
- **Adjacent solution docs:**
  - `docs/solutions/security-issues/prompt-injection-llm-pipeline.md` — the sanitization the cap is sized against
  - `docs/solutions/security-issues/user-input-ai-param-allowlist-and-prompt-injection.md` — sibling control at the same boundary
  - `docs/solutions/logic-errors/parselessonmarkdown-slug-truncation-trailing-hyphen.md` — strip-after-slice pattern precedent
- **Code references:**
  - `src/app/api/curate/route.ts:30-36` — current `bodyText`-only cap
  - `src/app/api/curate/route.ts:64-78` — `selectedCourse` short-circuit branch
  - `src/lib/ai.ts:14` — `MAX_PROMPT_FIELD_LEN` (to export)
  - `src/lib/ai.ts:84-86` — `sanitizeForPrompt` (UTF-16 defect)
  - `src/lib/ai.ts:88-99` — `formatPostsForCuration` (where `title/subtitle/excerpt` reach the curation prompt)
  - `src/lib/ai.ts:362-417` — `rewriteAsLesson` (where `bodyText` and `selection.*` reach the rewrite prompt)
  - `src/lib/html-text.ts:3` — `MAX_POST_WORDS`
  - `src/lib/html-text.ts:40-69` — `truncateTextToWords` (unchanged in this plan)
  - `src/types/index.ts:30-40` — `SubstackPostSchema`
  - `src/types/index.ts:74` — `MAX_BODY_CHARS` (to raise)
  - `src/__tests__/curate-route-word-cap.test.ts` — test scaffolding to extend

### Related Work

- **Origin PR (the one being completed):** PR #17 — `eeb3b70` (extract helper), `5322d56` (paragraph break fix), `56a630a` (`bodyText` cap re-enforcement)
- **Originally-closed bypass:** todo `009-complete-p2-bodyText-length-cap-bypass-direct-api.md`
- **Closing thread:** todos #146 (the original `bodyText` re-enforcement, now applied to siblings), #147 (paragraph break), #148 (test coverage for the new helper) — all complete in PR #17

### External Research (added during deepening)

**Authoritative guidance:**
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/) — published Nov 2024, current as of May 2026
  - [LLM01: Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — layered validation guidance
  - [LLM10: Unbounded Consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/) — the actual threat-model frame for length caps
- [Vercel — Building Secure AI Agents](https://vercel.com/blog/building-secure-ai-agents)
- [Anthropic — Mitigate jailbreaks and prompt injections](https://platform.claude.com/docs/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)
- [UAX #15 — Unicode Normalization Forms](https://www.unicode.org/reports/tr15/) (cap-before-collapse ordering rationale)

**Real-world incidents validating the approach:**
- [CVE-2025-48985 — Vercel AI SDK input validation bypass](https://vercel.com/changelog/cve-2025-48985-input-validation-bypass-on-ai-sdk) — exact "cap at helper, not at boundary" failure mode
- [gemini-cli #22753 — truncateString slices surrogate pairs](https://github.com/google-gemini/gemini-cli/issues/22753) — same exact bug pattern as #168
- EchoLeak (CVE-2025-32711), Cursor IDE (CVE-2025-54135/54136) — broader prompt-injection incidents validating layered defense

**Technical references:**
- [dasroot.net — Building a Middleware Layer for Prompt Injection Defense (Feb 2026)](https://dasroot.net/posts/2026/02/building-middleware-layer-prompt-injection-defense/) — operation ordering: cap → NFC → strip → collapse
- [Rafter — Prompt Injection 101](https://rafter.so/blog/prompt-injection-101) — bidi-override / zero-width as injection vectors
- [jonschlinkert/intl-segmenter](https://github.com/jonschlinkert/intl-segmenter) — `Intl.Segmenter` OOM behavior on >40K char inputs
- [Mathias Bynens — JavaScript Encoding](https://mathiasbynens.be/notes/javascript-encoding) — UTF-16 surrogate primer
- [Vitest 4.x docs — `vi.hoisted`, `vi.mock(import())`, `vi.mocked`](https://vitest.dev/api/vi.html)
- [Zod 4 changelog](https://zod.dev/v4/changelog)
- [Next.js 16 streaming docs](https://nextjs.org/docs/app/guides/streaming)

**Lint / tooling considered:**
- [`eslint-plugin-vercel-ai-security`](https://www.npmjs.com/package/eslint-plugin-vercel-ai-security) — covers OWASP LLM Top 10 2025; defer to a follow-up

### Versions in repo (verified by framework-docs research)

- `vitest@^4.1.4`
- `next@16.1.6`
- `zod@^4.3.6`
- `@anthropic-ai/sdk` (current)
- No `fast-check` (property-testing dep) — using `it.each` patterns
