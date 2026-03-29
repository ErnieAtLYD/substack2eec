---
status: pending
priority: p3
issue_id: "041"
tags: [code-review, security, export]
dependencies: []
---

# Review `export.ts` for Safe Handling of LLM-Generated `title`, `subjectLine`, `keyTakeaway`

## Problem Statement

`parseLessonMarkdown` in `ai.ts` extracts `title` and `keyTakeaway` from LLM-generated markdown via regex. These values are returned to the client via SSE (`lesson_done` event) and later sent back in `ExportRequest.lessons`. They flow into `buildZip` in `src/lib/export.ts`.

If `buildZip` writes these fields into a structured format (YAML front matter, HTML, etc.) without escaping, a secondary injection vector exists — the LLM could produce a title containing YAML metacharacters, HTML tags, or other characters that corrupt the export file structure.

The XML injection chain within the LLM pipeline is closed by PR #4 (`xmlEscape` in `buildCourseContextBlock`). This finding is about the separate downstream path through the export route.

## Findings

**Location:** `src/lib/export.ts` (not yet reviewed for this issue)

Fields at risk: `title`, `subjectLine`, `previewText`, `keyTakeaway` in `GeneratedLesson` — all LLM-generated, regex-parsed from markdown, round-tripped through the client, and written into the ZIP archive.

Raised by: security-sentinel.

## Proposed Solutions

### Option A: Read and audit `export.ts` for interpolation safety
- Check how `title`, `subjectLine`, `previewText`, `keyTakeaway` are written into ZIP file contents
- Verify any YAML/HTML/Markdown serialization escapes these fields appropriately
- If raw interpolation exists, apply field-appropriate escaping

### Option B: Validate `ExportRequest.lessons` with Zod at the export route boundary
Similar to todo #038 — add Zod schema validation to `/api/export` so these fields have known max lengths and character constraints before reaching `buildZip`.

## Recommended Action

Option A first — read `export.ts` to determine whether there is actually a vulnerability. Option B if a gap is found.

## Technical Details

**Affected files:**
- `src/lib/export.ts`
- `src/app/api/export/route.ts`

## Acceptance Criteria

- [ ] `export.ts` reviewed for unescaped interpolation of `title`, `subjectLine`, `previewText`, `keyTakeaway`
- [ ] Any identified interpolation gaps fixed with format-appropriate escaping
- [ ] If no gaps found, this todo can be closed as confirmed-safe

## Work Log

- 2026-03-29: Identified during multi-agent review of PR #4 (security-sentinel)
