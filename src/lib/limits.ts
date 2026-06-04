// Trust-boundary input caps. Single source of truth for "how much
// attacker-controlled string can reach the LLM." Imported by route handlers
// (where caps are enforced) and by helpers in src/lib/ai.ts (defense-in-depth
// assertions). No 'server-only' import — these are constants, not secrets.

// Short prompt-bound fields (title, subtitle, excerpt, lesson titles, etc.)
export const MAX_PROMPT_FIELD_LEN = 300 as const

// DoS bound on bodyText after safeSlice; truncateTextToWords does the
// semantic narrowing. 30_000 chars is generous enough that the word cap is
// the binding constraint for typical English (was 15_000, which shadowed
// MAX_POST_WORDS for most posts — see plan 2026-05-10).
export const MAX_BODY_CHARS = 30_000 as const

// LLM-budget cap on bodyText words. Binding constraint for typical English;
// MAX_BODY_CHARS only fires for non-Latin / emoji-heavy content.
export const MAX_POST_WORDS = 2500 as const

// DoS bound on the SSE reassembly buffer in parseSSEStream: the largest
// incomplete frame (no \n\n terminator yet) we will hold before concluding the
// upstream /api/curate response is malformed (CDN error page, proxy, one giant
// chunk) and bailing. A single legitimate lesson_done frame is far under this;
// the cap is on the unterminated remainder, not cumulative throughput.
export const MAX_SSE_BUFFER_CHARS = 1_000_000 as const

// DoS bound on total SSE frames yielded by parseSSEStream: bounds CPU and
// accumulated client state when a malfunctioning same-origin server emits
// endless *valid* frames — the growth dimension MAX_SSE_BUFFER_CHARS doesn't
// cover (#186). Legitimate ceiling ≈ 20k (10 lessons × ~2k text_delta-sized
// lesson_chunk events at max_tokens 2048), so 100k is a ~5× margin.
export const MAX_SSE_FRAMES = 100_000 as const
