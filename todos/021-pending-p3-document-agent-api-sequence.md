---
status: done
priority: p3
issue_id: "021"
tags: [code-review, agent-native, documentation]
dependencies: []
---

# Agent API Sequence Undocumented — Edit-Then-Export Flow Not Discoverable

## Problem Statement

The three-step API pipeline (`fetch-posts` → `curate` → `export`) is not documented anywhere an agent can discover. The implicit "edit" step between curate and export — where an agent can mutate `GeneratedLesson.markdownBody` before passing to export — is completely undocumented. An agent must reverse-engineer the type contracts to discover it.

**Why it matters:** Agents are first-class consumers of this API. Without documented contracts, automated pipelines are fragile and opaque.

## Findings

From agent-native reviewer:
- `CLAUDE.md` documents project structure but not the agent-callable API sequence
- No `AGENTS.md` exists
- The `/api/export` route accepts whatever `GeneratedLesson[]` it receives, making the mutation step implicitly possible but never stated

Additionally: `lessonCount` values 3, 7, 10 are supported by the API but the UI only exposes 5, creating undocumented agent-only capabilities.

## Proposed Solutions

### Option A — Add agent sequence to `CLAUDE.md` (Recommended)

Add a section to `CLAUDE.md`:

```markdown
## Agent API Sequence
1. `POST /api/fetch-posts` `{ url: string }` → `{ posts: SubstackPost[] }`
2. `POST /api/curate` `{ posts, lessonCount: 3|5|7|10 }` → SSE stream → `{ lessons: GeneratedLesson[], courseMeta }`
3. (Optional) Mutate `lessons[].markdownBody` directly
4. `POST /api/export` `{ lessons, courseTitle, courseDescription }` → ZIP binary
```

- **Pros:** Zero code change, immediately discoverable
- **Cons:** Documentation can drift from implementation
- **Effort:** Trivial | **Risk:** None

### Option B — Create `AGENTS.md`

Dedicated agents documentation file with full request/response schemas, example curl commands, and notes on available `lessonCount` values.

- **Pros:** More comprehensive, separate from dev instructions
- **Effort:** Small | **Risk:** None

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

- **Affected files:** `CLAUDE.md` or new `AGENTS.md`

## Acceptance Criteria

- [ ] The three-step API sequence is documented with request/response shapes
- [ ] Available `lessonCount` values are listed
- [ ] The optional mutation step before export is documented

## Work Log

- 2026-03-27: Surfaced by agent-native reviewer during PR #3 review

## Resources

- PR: ErnieAtLYD/substack2eec#3
