---
title: "Anthropic Tool Use Response Truncated — Missing Fields"
description: "Forcing tool use with tool_choice and a low max_tokens causes Claude to truncate the tool input JSON mid-serialization. Fields that appear later in the schema (e.g. a lessons array) are silently missing. Fix: raise max_tokens and check stop_reason."
tags:
  - anthropic
  - tool-use
  - max-tokens
  - truncation
  - claude-api
category: runtime-errors
severity: high
framework: next.js-15-typescript
---

# Anthropic Tool Use Response Truncated — Missing Fields

## Symptom

Runtime error when iterating over the tool response:

```
TypeError: raw.lessons is not iterable
```

Or after adding a type guard:

```
Error: Curation tool returned unexpected shape — "lessons" is missing.
Raw: {"courseTitle":"...","courseDescription":"...","targetAudience":"...","overallRationale":"..."}
```

The course metadata fields are present but the `lessons` array is entirely absent.

## Root Cause

When `max_tokens` is too low for a forced tool call (`tool_choice: { type: 'tool' }`), Claude generates the tool input JSON in schema field order. Fields that come early in the schema (metadata strings) fit within the budget. Fields that come later (arrays, nested objects) are cut off when the token budget is exhausted.

The API does **not** raise an error — it returns a valid-looking `tool_use` block with a partial `input` object. The `stop_reason` is `"max_tokens"` rather than `"end_turn"`, but if you don't check it, you proceed to parse an incomplete payload.

**Token budget for a 5-lesson curation response:**
- Course metadata (4 string fields): ~100 tokens
- 5 lessons × (slug + sequencePosition + lessonFocus ~30 words + selectionRationale ~30 words): ~800–1200 tokens
- JSON structure overhead: ~100 tokens
- **Total: ~1000–1400 tokens of output**

`max_tokens: 1024` fits the metadata but not the lessons. `max_tokens: 4096` fits everything with margin.

## Broken Pattern

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,              // ← too low; truncates before lessons array
  tools: [CURATION_TOOL],
  tool_choice: { type: 'tool', name: 'select_course_posts' },
  messages: [{ role: 'user', content: prompt }],
})

// No stop_reason check — proceeds with incomplete data
const toolBlock = response.content.find(b => b.type === 'tool_use')
const raw = toolBlock.input as { lessons: CuratedLesson[] }

return {
  lessons: [...raw.lessons].sort(...)  // ← throws: raw.lessons is undefined
}
```

## Fix

Raise `max_tokens`, check `stop_reason`, and validate the parsed shape:

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,              // ← sufficient for full structured response
  tools: [CURATION_TOOL],
  tool_choice: { type: 'tool', name: 'select_course_posts' },
  messages: [{ role: 'user', content: prompt }],
})

// Always check stop_reason before touching the payload
if (response.stop_reason === 'max_tokens') {
  throw new Error('Curation response was truncated (max_tokens). Try with fewer posts.')
}

const toolBlock = response.content.find(b => b.type === 'tool_use')
if (!toolBlock || toolBlock.type !== 'tool_use') {
  throw new Error('Claude did not return a tool call')
}

// Validate the shape — do not cast and assume
const raw = toolBlock.input as Record<string, unknown>
if (!Array.isArray(raw.lessons)) {
  throw new Error(
    `Tool returned unexpected shape — "lessons" is ${
      raw.lessons === undefined ? 'missing' : typeof raw.lessons
    }. Raw: ${JSON.stringify(raw).slice(0, 300)}`
  )
}
```

## Token Budget Rule of Thumb

For tool use output, estimate generously:

```
max_tokens = (fields × avg_field_tokens) × 1.5 + 500 buffer

Example — 5 lessons × 4 fields × ~50 tokens each:
  = 5 × 4 × 50 = 1000 tokens of content
  × 1.5 safety margin = 1500
  + 500 buffer = 2000 minimum

Use 4096 — Claude only uses what it needs.
```

**In practice:** for any tool call producing arrays of objects, start at `4096`. Only go lower after measuring actual output token usage from `response.usage.output_tokens`.

## Prevention Checklist

- [ ] Set `max_tokens` to at least `4096` for tool calls that return arrays
- [ ] Always check `response.stop_reason === 'max_tokens'` before parsing tool output
- [ ] Use `Record<string, unknown>` not a cast type when reading `toolBlock.input`
- [ ] Validate presence and type of every required field before accessing it
- [ ] Log `response.usage` during development to measure actual output token consumption

## stop_reason Reference

| Value | Meaning |
|---|---|
| `end_turn` | Normal completion — safe to parse |
| `max_tokens` | Truncated — **do not parse**, raise an error |
| `stop_sequence` | Hit a custom stop sequence — check context |
| `tool_use` | Waiting for tool result (multi-turn) |

## References

- [Anthropic Messages API — stop_reason](https://platform.claude.com/docs/en/api/messages)
- `src/lib/ai.ts` — `curatePostSelection()` implements the fixed pattern
