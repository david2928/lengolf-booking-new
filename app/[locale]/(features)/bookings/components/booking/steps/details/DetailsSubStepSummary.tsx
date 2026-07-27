'use client';

import type { ReactNode } from 'react';
import { ChangeAnswerButton } from '../../affordances';

export interface DetailsSubStepSummaryProps {
  /**
   * Sub-step name, e.g. "Session".
   *
   * Required, now that every caller is a collapsed sub-step. Several of these
   * stack up as the customer advances, and without a label "1 hr · 1 person" and
   * "Standard Set" are two anonymous fragments. It was optional while the slot
   * chip shared this component — that chip recapped earlier STEPS rather than a
   * completed sub-step and had no sub-step to name — and it is the label that
   * now tells these rows apart from the header line, which deliberately has
   * none.
   */
  label: string;
  /** One-line recap of what the customer chose, e.g. "1 hr · 1 person". */
  value: ReactNode;
  /** Translated "Change" — the word the customer reads on the pill. */
  changeLabel: string;
  /** Re-opens the decision this row stands in for. */
  onChange: () => void;
}

/**
 * One compact recap row: what was decided, and the single affordance that
 * re-opens it.
 *
 * Renders on mobile only — `BookingDetails` wraps every call in `lg:hidden`,
 * because above `lg:` step 3 renders whole and nothing is collapsed. That is
 * load-bearing for the layout choices below, which are free to assume a phone.
 *
 * Two callers once, now three collapsed sub-steps and no slot chip: the chip
 * that used to restate the date, start time and bay was deleted when those facts
 * moved to the step header's subline, which carries its own Change pill. This
 * row and that line are deliberately the SAME SHAPE — facts, then one green
 * control that reopens them — because they make the same promise, and on the
 * extras and contact sub-steps they sit an inch apart.
 *
 * They are not the same THING, and the difference is scope: this row reopens a
 * sub-step in place, the header line leaves step 3 for step 2. Same promise,
 * different distance.
 *
 * The affordance is `ChangeAnswerButton` rather than the green underlined text
 * it used to be: this navigates, and a few rows away sat a "View Details" link
 * drawn identically that only opened a modal. See `affordances.tsx` for the
 * rule. `type="button"` is still load-bearing and now lives in that component:
 * this renders inside the booking `<form>`, so a button with no explicit type
 * would default to `submit` and fire the booking.
 */
export function DetailsSubStepSummary({
  label,
  value,
  changeLabel,
  onChange,
}: DetailsSubStepSummaryProps) {
  return (
    /* NO BORDER AND NO FILL. This used to be a grey rounded card, and it was the
       odd one out in both directions.

       Against the HEADER: the step header's subline states what earlier steps
       settled and carries its own Change pill, so on the extras and contact
       sub-steps two rows an inch apart said "here are some facts, here is a
       Change" in two different visual languages — one boxed, one not. The owner
       asked what justified two designs. Nothing did.

       Against its OWN EXPANDED STATE: `panelClass` in `BookingDetails` is
       `space-y-4 sm:space-y-6` and nothing else. An expanded sub-step is not a
       card — the whole form is one white card and the sub-steps are stacked
       content inside it. So collapsing a section used to ADD a box that
       expanding it took away, which is backwards: collapsing should remove
       weight, not add it.

       What separates these rows from the live inputs below is now what
       separates them everywhere else in the flow — a semibold label, a settled
       value in prose, and the one green control that reopens them. That is the
       same shape the header line uses, which is the point. */
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-0.5">
      <p className="min-w-0 text-sm text-gray-700">
        {label && (
          <>
            <span className="font-semibold text-gray-900">{label}</span>
            {/* Literal spaces, not `mx-1.5`: the separators inside `value` are
                plain " · " strings, so a margin-only gap matched them visually
                but not textually — screen readers and copy/paste got
                "Session·1 hr" while every later separator had spaces. */}
            <span className="text-gray-300">{' · '}</span>
          </>
        )}
        {value}
      </p>
      <ChangeAnswerButton onClick={onChange} className="ml-auto">
        {changeLabel}
      </ChangeAnswerButton>
    </div>
  );
}
