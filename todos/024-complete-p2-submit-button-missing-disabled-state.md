---
status: pending
priority: p2
issue_id: "024"
tags: [code-review, ux, accessibility, form]
dependencies: []
---

# Submit Button Missing `disabled` Attribute and Visual State

## Problem Statement

The PR #3 redesign removed the `disabled:opacity-50` class from the submit button and did not add a `disabled` attribute. In the old design the button had `disabled:opacity-50` as a visual cue. The new button has neither a `disabled` prop nor the Tailwind class. Users and screen readers cannot tell when the button is in an active/inactive state.

**Why it matters:** If the URL field is empty, the `required` attribute blocks native form submission, but the button does not visually communicate it is inactive. Additionally, adding `disabled={step !== 'input'}` would prevent any edge case where `handleGenerate` fires while a generation is already in progress (e.g., programmatic form submission, keyboard shortcuts outside the conditional render).

## Findings

**Location:** `src/components/features/ReviewForm.tsx:335–347`

```tsx
<button
  type="submit"
  className="inline-flex items-center gap-2 rounded-lg bg-gray-500 hover:bg-gray-600 px-5 py-3 text-sm font-medium text-white transition-colors"
  // ← No disabled attribute
  // ← No disabled:opacity-50 or disabled:cursor-not-allowed classes
>
  Generate Courses
</button>
```

Prior version:
```tsx
<button
  type="submit"
  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
>
  Generate Course
</button>
```

The old button had `disabled:opacity-50` but also no `disabled` attribute — so the class had no functional effect either. This is a regression in intent if not in behavior.

## Proposed Solutions

### Option A: Add `disabled` attribute with visual classes (Recommended)
```tsx
<button
  type="submit"
  disabled={!url || step !== 'input'}
  className="... disabled:opacity-50 disabled:cursor-not-allowed"
>
```
- **Pros:** Correct semantic and visual state; accessible; prevents accidental double-submit
- **Effort:** Small
- **Risk:** None

### Option B: Add only visual `disabled:*` classes without the attribute
Since the form is conditionally rendered (only shown when `step === 'input'`), double-submission is unlikely. Add the Tailwind classes only:
```tsx
className="... disabled:opacity-50 disabled:cursor-not-allowed"
```
- **Pros:** Less code change
- **Cons:** Without the `disabled` attribute, the classes do nothing — same as before
- **Effort:** Trivial
- **Risk:** None (but also no benefit without the attribute)

## Recommended Action

Option A. The `disabled={!url}` guard also gives users clear visual feedback when the field is empty.

## Technical Details

**Affected files:**
- `src/components/features/ReviewForm.tsx:335–347` — submit button

## Acceptance Criteria

- [ ] Submit button is visually dimmed when URL field is empty
- [ ] Submit button is visually dimmed and non-interactive when `step !== 'input'`
- [ ] Screen readers receive disabled state via the `disabled` attribute
- [ ] Clicking the button while disabled does not invoke `handleGenerate`

## Work Log

- 2026-03-28: Finding created from PR #3 code review (feat/ui-redesign-centered-layout)

## Resources

- PR #3: feat(ui): redesign homepage with centered card layout
- TypeScript reviewer finding: "P2 — Submit button has no disabled state"
