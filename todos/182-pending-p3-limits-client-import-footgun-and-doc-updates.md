---
status: pending
priority: p3
issue_id: "182"
tags: [code-review, quality, documentation]
dependencies: []
---

# Document limits.ts client-import exception (footgun) + optional CLAUDE.md SSE note

PR #32 makes a `'use client'` component depend on `src/lib/limits.ts` *not* importing `server-only`. That's safe today (verified: no imports, numeric constants only) but contradicts the blanket CLAUDE.md rule, creating a latent footgun.

## Problem Statement

Project CLAUDE.md says "All `src/lib/` files must import `server-only`." `limits.ts` is a deliberate, documented exception (its header: "No 'server-only' import — these are constants, not secrets"). Now that `ReviewForm.tsx:4` imports it client-side, anyone who later "fixes" `limits.ts` to satisfy the blanket rule breaks the client build with a non-obvious error.

## Findings

- Security review confirmed: `limits.ts` has zero imports, exports only numeric `as const` literals, and pulls no transitive `src/lib` code (e.g., `ai.ts`, `substack.ts`) into the client bundle. The import is safe.
- CLAUDE.md's blanket rule and the file's documented exception now have a client component depending on the exception — undocumented at the import site.
- Agent-native reviewer (optional): a one-sentence note near the CLAUDE.md "Parse SSE" snippet — "a malformed upstream response may never emit a `\n\n` terminator; clients that buffer for reassembly should bound the unterminated remainder" — frames the same defensive advice for agent consumers without implying a server contract.
- TS reviewer: minor comment duplication between `limits.ts:19-24` and `ReviewForm.tsx:96-98` ("cap is on the unterminated remainder…" appears in both); one can be trimmed to a line.

## Proposed Solutions

### Option 1: Comment at import site + CLAUDE.md rule refinement

**Approach:**
- Add at `ReviewForm.tsx:4`: `// limits.ts is intentionally client-safe (no 'server-only') — see its header`
- Amend CLAUDE.md rule to: "All `src/lib/` files must import `server-only` **except `limits.ts`** (client-safe constants, imported by the UI)"
- Optionally add the agent-facing SSE buffering sentence near the Parse SSE snippet

**Pros:** Prevents the footgun at both the place someone would trip it and the place the rule lives
**Cons:** None meaningful
**Effort:** 15 min
**Risk:** Low

---

### Option 2: Comment only, no CLAUDE.md change

**Approach:** Just the import-site comment.

**Pros:** Minimal
**Cons:** The blanket rule still invites a future "compliance fix"
**Effort:** 5 min
**Risk:** Low

## Recommended Action

**To be filled during triage.**

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:4`
- `CLAUDE.md` (Key rules section; optionally Parse SSE snippet)
- `src/lib/limits.ts:19-24` (optional comment dedup)

## Resources

- **PR:** #32
- **Reviewers:** kieran-typescript-reviewer (finding 1), security-sentinel (Q4), agent-native-reviewer (observation 1)

## Acceptance Criteria

- [ ] Import-site comment present
- [ ] CLAUDE.md rule no longer blanket-contradicts the client dependency
- [ ] (Optional) agent-facing SSE buffering note added

## Work Log

### 2026-06-04 - Initial Discovery

**By:** Claude Code (/workflows:review of PR #32)

**Learnings:**
- A documented exception to a blanket rule becomes a footgun the moment something depends on the exception; document at the dependency site.
