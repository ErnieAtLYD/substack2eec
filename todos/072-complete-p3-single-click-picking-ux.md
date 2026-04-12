---
status: pending
priority: p3
issue_id: "072"
tags: [code-review, simplicity, ux, multi-candidate]
dependencies: []
---

# Two-Click Picking UX Adds Friction — Simplify to Single Click

## Problem Statement

The plan describes a two-interaction picking flow: user clicks a card (ring highlight appears, card enters "selected" state), then clicks a separate "Generate Course" CTA. With only 3 static choices, this is unnecessary friction. There is nothing to confirm after making a selection — the user has already indicated intent by clicking "Choose this course →". The intermediate selected state serves no purpose.

Simplifying to a single click removes `selectedCandidate` state, the "Generate" button, and the activation logic, making the component simpler and the UX faster.

## Findings

**Source:** Simplicity reviewer

**Proposed state to remove:**
```typescript
const [selectedCandidate, setSelectedCandidate] = useState<CuratedSelection | null>(null)
```

**Proposed render to simplify:** Replace "select card + Generate CTA" with direct `handleConfirmCandidate` call on card button click.

## Proposed Solutions

### Option A — Single-click: button click calls `handleConfirmCandidate` directly (Recommended)

```typescript
// Each card's button:
<button onClick={() => handleConfirmCandidate(candidate)}>
  Choose this course →
</button>
```

No `selectedCandidate` state needed. No "Generate" CTA needed. Clicking a card immediately transitions to `step = 'generating'`.

**Pros:** ~15 fewer LOC; cleaner state machine; faster UX
**Cons:** No visual confirmation before generation starts (acceptable — user has 3 explicit choices, not a form)
**Effort:** Small
**Risk:** Low

### Option B — Keep two-click with confirmation dialog

Show a modal: "Generate '[courseTitle]'? This will take ~2 minutes." with Cancel / Confirm buttons.

**Pros:** Prevents accidental clicks
**Cons:** Adds even more steps; generation is not irreversible; over-engineering for 3 choices
**Effort:** Medium
**Risk:** Low

## Recommended Action

Option A. Update plan to remove `selectedCandidate` state and the separate "Generate" CTA. The picking step transitions directly on card click.

## Technical Details

- **File:** `src/components/features/ReviewForm.tsx`
- **State to remove:** `selectedCandidate: CuratedSelection | null`
- **Button to remove:** "Generate Course" CTA

## Acceptance Criteria

- [ ] No `selectedCandidate` state in `ReviewForm`
- [ ] Card button click immediately calls `handleConfirmCandidate`
- [ ] Plan updated to reflect single-click picking UX

## Work Log

- 2026-04-04: Created during plan review. Simplicity reviewer flagged.
