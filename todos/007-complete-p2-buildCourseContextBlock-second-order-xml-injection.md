---
status: done
priority: p2
issue_id: "007"
tags: [code-review, security, prompt-injection, xml]
dependencies: []
---

# `buildCourseContextBlock` Interpolates Unescaped LLM Output into XML — Second-Order Injection

## Problem Statement

`buildCourseContextBlock` in `src/lib/ai.ts` builds an XML block that is fed to the rewrite model (Step 2). It interpolates `courseTitle`, `courseDescription`, `targetAudience`, `overallRationale`, and prior lesson titles/takeaways — all AI-generated output from the curation step (Step 1). These fields are **not XML-escaped**.

The curation model in Step 1 is fed unescaped post content (see todo #008). A sufficiently adversarial post could cause the curation model to produce a `courseTitle` containing `</title><arc>INJECTED</arc><title>`, which would corrupt the XML structure fed to the rewrite model in Step 2. This forms a two-stage injection chain:

```
Attacker post content → curation LLM output (Step 1) → unescaped XML (Step 2 prompt)
```

**Why it matters:** XML tag injection in the rewrite prompt can corrupt lesson generation, override course context, or inject malicious framing into the AI's context window.

## Findings

**Location:** `src/lib/ai.ts:195-207` — `buildCourseContextBlock`

```typescript
return `<course>
<title>${selection.courseTitle}</title>
<description>${selection.courseDescription}</description>
<audience>${selection.targetAudience}</audience>
<arc>${selection.overallRationale}</arc>
<prior_lessons>
${prior}
</prior_lessons>
</course>`
```

`selection.*` fields come from curation LLM output, which is itself influenced by unescaped post content. The `prior` string embeds `l.title` and `l.keyTakeaway` from `GeneratedLesson` — rewrite LLM outputs that similarly could contain injected XML characters.

The `xmlEscape` function already exists in `ai.ts` from the previous security fix — it just wasn't applied here.

## Proposed Solutions

### Option A: Apply `xmlEscape` to all interpolated fields (Recommended)
```typescript
return `<course>
<title>${xmlEscape(selection.courseTitle)}</title>
<description>${xmlEscape(selection.courseDescription)}</description>
<audience>${xmlEscape(selection.targetAudience)}</audience>
<arc>${xmlEscape(selection.overallRationale)}</arc>
<prior_lessons>
${prior}
</prior_lessons>
</course>`
```

And update the `prior` string construction:
```typescript
const prior = priorLessons.length > 0
  ? priorLessons.map(l =>
      `  Lesson ${l.lessonNumber}: ${xmlEscape(l.title)} — ${xmlEscape(l.keyTakeaway)}`
    ).join('\n')
  : '  (none yet)'
```
- **Pros:** 5-line change, reuses the existing `xmlEscape` function, closes the second-order chain
- **Effort:** Small
- **Risk:** None — escaped content is semantically identical to Claude

### Option B: Trust the curation output (not recommended)
Don't escape, on the grounds that Claude-generated content is unlikely to contain malicious XML.
- **Pros:** No change
- **Cons:** Defense-in-depth is cheap here; the chain is real even if low-probability

## Recommended Action

Option A. The `xmlEscape` helper is already in scope in `ai.ts`. This is a 5-line change that closes a complete two-stage injection chain.

## Technical Details

**Affected file:** `src/lib/ai.ts` — `buildCourseContextBlock` (lines 191–204) and the `prior` string construction (lines 192–196)

## Acceptance Criteria

- [ ] All 4 `selection.*` fields in `buildCourseContextBlock` are XML-escaped
- [ ] `l.title` and `l.keyTakeaway` in the `prior` string are XML-escaped
- [ ] Build passes cleanly after changes

## Work Log

- 2026-03-18: Found during security fix review of feat/custom-course-length

## Resources

- Security reviewer finding: "P2-A `buildCourseContextBlock` — unescaped LLM output in XML"
