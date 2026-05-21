---
status: pending
priority: p2
issue_id: "174"
tags: [code-review, testing, type-safety]
dependencies: []
---

# `curate-route-word-cap.test.ts` Mock Indirection Defeats Type Checking Of Mocked Functions

## Problem Statement

The test wraps each mocked function in `(...args: unknown[]) => fn(...args)`:

```ts
vi.mock('@/lib/ai', () => ({
  curatePostSelection: (...args: unknown[]) => curatePostSelection(...args),
  rewriteAsLesson: (...args: unknown[]) => rewriteAsLesson(...args),
  ...
}))
```

The `unknown[]` rest signature erases the actual function shape. If the route's call shape to `curatePostSelection` changes (renamed param, reordered args, new required arg), the test still passes — exactly the regression-detection role the test exists for.

Same shape repeated in two `(postsArg as Array<{ bodyText: string }>)` casts that read mock calls.

Flagged by kieran-typescript-reviewer (P2).

## Findings

**Location:** `src/__tests__/curate-route-word-cap.test.ts:7-15, 74, 88`

## Proposed Solutions

### Option A: Mock with `vi.fn()` directly, no wrapper (recommended)

```ts
const curatePostSelection = vi.fn()
const rewriteAsLesson = vi.fn()

vi.mock('@/lib/ai', () => ({
  curatePostSelection,
  rewriteAsLesson,
  parseLessonMarkdown: vi.fn(),
  sanitizeForPrompt: (s: string) => s,
}))
```

Then read calls via `vi.mocked(curatePostSelection).mock.calls[0]` for typed access — uses the imported function's own type.

- Pros: Type-checked argument shape; deletes 4 lines.
- Cons: None. The wrapper exists for module-evaluation-order reasons in some Vitest patterns, but isn't needed here.
- Effort: Trivial.

### Option B: Type the wrapper

```ts
type Curate = typeof import('@/lib/ai').curatePostSelection
const curatePostSelection: Curate = vi.fn()
```

- Pros: Keeps current shape, adds types.
- Cons: Verbose for marginal benefit over Option A.
- Effort: Trivial.

## Recommended Action

_Pending triage._ Option A. Replace casts at L74/L88 with `vi.mocked(...).mock.calls[0]`.

## Technical Details

**Affected files:**
- `src/__tests__/curate-route-word-cap.test.ts`

## Acceptance Criteria

- [ ] No `unknown[]` mock wrappers
- [ ] No `as Array<{...}>` casts on mock calls
- [ ] Test still passes; type errors surface in CI if route changes shape

## Work Log

_2026-05-10:_ Filed during multi-agent review of PR #17.

## Resources

- `src/__tests__/curate-route-word-cap.test.ts:7-15`
