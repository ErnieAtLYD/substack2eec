---
status: pending
priority: p2
issue_id: "068"
tags: [code-review, anthropic, tool-use, max-tokens, multi-candidate]
dependencies: []
---

# `proposeCourseCandidates` Needs Higher `max_tokens`, `stop_reason` Guard, and Per-Candidate Validation

## Problem Statement

Three related gaps in the proposed `proposeCourseCandidates` function:

1. **`max_tokens` will truncate at lessonCount=10**: Producing 3 full `CuratedSelection` candidates is roughly 3× the output of a single curation call. At `lessonCount=10`, the estimated output is ~4,800 tokens — exceeding the current 4096 used by `curatePostSelection`. Truncation is silent; the API returns a valid-looking JSON object with the candidates array cut off mid-stream.

2. **Missing `stop_reason` guard**: The existing `curatePostSelection` checks `if (response.stop_reason === 'max_tokens')` before parsing. This pattern must be replicated. Without it, truncated responses are silently cast to `CuratedSelection[]` with missing candidates.

3. **No per-candidate validation**: The existing `curatePostSelection` only checks `Array.isArray(raw.lessons)`. The new function must check `Array.isArray(raw.candidates)` and validate each candidate's `lessons` field individually — a single malformed candidate should not corrupt the entire result.

Both the max_tokens issue and the missing guards are documented failure modes in this codebase (`docs/solutions/runtime-errors/anthropic-tool-use-max-tokens-truncation.md`).

## Findings

**Source:** Performance oracle (findings 1, 4, 5), TypeScript reviewer (finding 2), learnings researcher

**Estimated output token requirements:**
- Per candidate: ~790 tokens (lessonCount=5), ~1,020 tokens (lessonCount=10)
- 3 candidates: ~2,370 tokens (lessonCount=5), ~3,060 tokens (lessonCount=10)
- With 1.5× safety margin and JSON overhead: ~3,600–4,800 tokens
- **Use `max_tokens: 8192`** (costs nothing extra unless consumed; eliminates truncation risk)

## Proposed Solutions

### Option A — Set max_tokens: 8192, add stop_reason guard, validate per-candidate (Recommended)

```typescript
export async function proposeCourseCandidates(
  posts: SubstackPost[],
  lessonCount: number,
): Promise<CuratedSelection[]> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 8192,  // ← 2× the existing 4096; covers lessonCount=10 with margin
    system: CURATION_SYSTEM,
    tools: [buildProposeCandidatesTool(lessonCount)],
    tool_choice: { type: 'tool', name: 'propose_course_candidates' },
    messages: [{ role: 'user', content: prompt }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Candidate proposal was truncated. Try with fewer posts.')
  }

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not return a tool call for candidate proposal')
  }

  const raw = toolBlock.input as Record<string, unknown>

  if (!Array.isArray(raw.candidates)) {
    throw new Error('Candidate proposal response was incomplete or invalid.')
  }

  // Validate each candidate individually; filter out malformed ones
  const candidates = (raw.candidates as Record<string, unknown>[])
    .filter(c => Array.isArray(c.lessons) && typeof c.courseTitle === 'string')
    .map(c => ({
      courseTitle: String(c.courseTitle ?? ''),
      courseDescription: String(c.courseDescription ?? ''),
      targetAudience: String(c.targetAudience ?? ''),
      overallRationale: String(c.overallRationale ?? ''),
      lessons: (c.lessons as CuratedLesson[]).slice().sort(
        (a, b) => a.sequencePosition - b.sequencePosition
      ),
    }))

  if (candidates.length < 3) {
    throw new Error(`Expected 3 course candidates, got ${candidates.length}. Please try again.`)
  }

  return candidates
}
```

**Pros:** Handles truncation, validates per-candidate, consistent with existing codebase patterns
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A. Add to plan's "New AI function" section: specify `max_tokens: 8192`, `stop_reason` check, and per-candidate validation pattern.

## Technical Details

- **File:** `src/lib/ai.ts` (new `proposeCourseCandidates` function)
- **Reference:** `curatePostSelection` at lines 101-149 as the pattern to follow
- **Reference:** `docs/solutions/runtime-errors/anthropic-tool-use-max-tokens-truncation.md`

## Acceptance Criteria

- [ ] `max_tokens: 8192` set on the Anthropic call in `proposeCourseCandidates`
- [ ] `stop_reason === 'max_tokens'` guard added before parsing tool output
- [ ] Each candidate validated individually before adding to result array
- [ ] Error thrown if fewer than 3 valid candidates returned
- [ ] Plan document specifies these requirements in the "New AI function" section

## Work Log

- 2026-04-04: Created during plan review. Performance oracle and TypeScript reviewer both flagged.
