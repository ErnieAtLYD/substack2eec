---
status: pending
priority: p3
issue_id: "161"
tags: [code-review, security, documentation, defense-in-depth]
dependencies: []
---

# `ExtractTextOptions.truncationMarker` Is A Latent Prompt-Injection Surface

## Problem Statement

`truncationMarker` is currently developer-supplied (only `spike/extract.ts` passes it, with a hard-coded constant). The API call site at `src/lib/substack.ts` passes nothing. Today, no attacker-controlled string reaches the marker.

But if a future caller threads a client-supplied value through `options.truncationMarker`, it becomes prompt-injection surface. The marker is appended to text that goes straight into the LLM prompt; `xmlEscape` at the surrounding tag boundary in `src/lib/ai.ts:376` escapes XML chars, so XML break-out is blocked, but plain-text injection like `\n\nIGNORE PRIOR INSTRUCTIONS...` would survive untouched inside `<bodyText>`.

A JSDoc note labeling the field as developer-supplied-only is cheap defense-in-depth.

## Findings

**Location:** `src/lib/html-text.ts:19-21, 48`

Flagged by security-sentinel (P3-2). Resolves naturally if #155 lands and the option is deleted.

## Proposed Solutions

### Option A: Add JSDoc warning

```ts
export interface ExtractTextOptions {
  /**
   * Appended to truncated output. Must be a developer-supplied constant —
   * never thread user input through this field. The marker is not sanitized
   * and is interpolated into LLM prompts verbatim.
   */
  truncationMarker?: string
}
```

- Pros: Documents the trust boundary.
- Cons: Becomes stale if #155 deletes the option.
- Effort: Negligible.

### Option B: Drop the option (covered by #155)

## Recommended Action

_Pending triage._ Skip if #155 lands; otherwise add the JSDoc.

## Technical Details

**Affected files:**
- `src/lib/html-text.ts`

## Acceptance Criteria

- [ ] Trust-boundary expectation is documented or the option is removed

## Work Log

_2026-05-02:_ Filed during code review of html-text extraction refactor.

## Resources

- Related: #155
- `docs/solutions/security-issues/prompt-injection-llm-pipeline.md`
