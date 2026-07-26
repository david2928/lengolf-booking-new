'use client';

import type { ReactNode } from 'react';
import { ChangeAnswerButton } from '../../affordances';

export interface DetailsSubStepSummaryProps {
  /** Sub-step name, e.g. "Session". */
  label: string;
  /** One-line recap of what the customer chose, e.g. "1 hr · Social Bay · 2". */
  value: ReactNode;
  /** Translated "Change". */
  changeLabel: string;
  /** Jumps straight back to the sub-step this summary stands in for. */
  onChange: () => void;
}

/**
 * One-line collapsed recap of a completed mobile sub-step, with the single
 * "Change" affordance that jumps directly back to it.
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
        <span className="font-semibold text-gray-900">{label}</span>
        {/* Literal spaces, not `mx-1.5`: the separators inside `value` are plain
            " · " strings, so a margin-only gap matched them visually but not
            textually — screen readers and copy/paste got "Session·1 hr" while
            every later separator had spaces. */}
        <span className="text-gray-300">{' · '}</span>
        {value}
      </p>
      <ChangeAnswerButton onClick={onChange}>{changeLabel}</ChangeAnswerButton>
    </div>
  );
}
