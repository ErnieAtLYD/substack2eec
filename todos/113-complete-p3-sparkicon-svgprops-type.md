---
status: complete
priority: p3
issue_id: "113"
tags: [code-review, typescript, ui, components]
dependencies: []
---

# SparkIcon Prop Type Should Extend React.SVGProps

## Problem Statement

`SparkIcon` was extracted as a named component in the `add-some-color` restyle. Its current prop type only accepts `className`:

```tsx
function SparkIcon({ className }: { className?: string }) {
```

This means callers cannot pass standard SVG attributes (`aria-label`, `style`, `width`, `height`, `focusable`, etc.) without a type error. If the icon is reused in a context requiring an override — e.g., a different size without a wrapper, or an accessible label — the type signature must be manually widened.

Additionally, `aria-hidden="true"` is hardcoded inside the component. This prevents callers from overriding it for cases where the icon carries meaning (e.g., a standalone icon button with no visible label).

## Findings

**Affected location:** `src/components/features/ReviewForm.tsx` lines 76–82

```tsx
// Current
function SparkIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="..." viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="..." />
    </svg>
  )
}

// Used at:
<SparkIcon className="w-4 h-4" />
```

**Raised by:** kieran-typescript-reviewer (P3-C)

## Proposed Solutions

### Option A — Extend React.SVGProps (Recommended)

```tsx
function SparkIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      {...props}
      className={className}
    >
      <path d="M15.98 1.804..." />
    </svg>
  )
}
```

Note: `{...props}` is spread before `className` so that callers can't accidentally override className via spread — className is always applied last. `aria-hidden` is spread last too if included in props (accessible override is intentional).

- **Pros:** Forward-compatible; no breaking change; callers can override any SVG attribute
- **Effort:** Tiny | **Risk:** None

### Option B — Keep current type, document limitations

Add a comment noting the intentional narrowness:

```tsx
// Only className accepted — widen to React.SVGProps<SVGSVGElement> if more props needed
function SparkIcon({ className }: { className?: string }) {
```

- **Pros:** Simpler for a single-use component
- **Cons:** Technical debt the moment a second use site appears
- **Effort:** Tiny | **Risk:** None

## Recommended Action

Option A. The fix is one line and eliminates the type debt entirely.

## Technical Details

**Affected file:** `src/components/features/ReviewForm.tsx:76`

## Acceptance Criteria

- [ ] `SparkIcon` accepts `React.SVGProps<SVGSVGElement>` (or equivalent)
- [ ] Existing call site `<SparkIcon className="w-4 h-4" />` continues to work unchanged
- [ ] TypeScript strict mode passes

## Work Log

- 2026-04-13: Found by kieran-typescript-reviewer on `add-some-color` branch review
