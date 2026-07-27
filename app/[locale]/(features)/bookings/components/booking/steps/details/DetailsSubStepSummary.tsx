'use client';

import type { ReactNode } from 'react';
import { ChangeAnswerButton } from '../../affordances';

export interface DetailsSubStepSummaryProps {
  /**
   * Sub-step name, e.g. "Session".
   *
   * Optional because the row serves two shapes of recap. A COLLAPSED SUB-STEP
   * needs its name: several of them stack up as the customer advances, and
   * without a label "1 hr · 1 person" and "Standard Set" are two anonymous
   * fragments. The SLOT CHIP on the session sub-step does not: it is the only
   * row on screen, it recaps earlier STEPS rather than a completed sub-step, and
   * there is no sub-step to name. Labelling it anyway would have meant inventing
   * a heading for facts the customer can already read.
   */
  label?: string;
  /** One-line recap of what the customer chose, e.g. "1 hr · 1 person". */
  value: ReactNode;
  /**
   * A quiet, NON-navigating affordance that belongs to the value — today only
   * the slot chip's bay "Info" link, which opens the bay-type explainer.
   *
   * A slot rather than something folded into `value` because `value` is prose
   * inside a `<p>`: a control nested in there would be swept along by the
   * paragraph's wrapping and, before the layout below, by its truncation.
   * Rendered immediately after the value and before the "Change" pill, so it
   * hugs the fact it explains rather than joining the row's action cluster —
   * which is also the visual difference between "this only tells you something"
   * and "this changes your booking". See `affordances.tsx` for that rule.
   */
  secondaryAction?: ReactNode;
  /** Translated "Change" — the word the customer reads on the pill. */
  changeLabel: string;
  /**
   * A longer accessible name for the pill, where the visible "Change" is not
   * self-describing.
   *
   * Every caller renders the same word, and on the mobile sub-step layout two
   * or three of these rows can be on screen at once. The collapsed summaries
   * are disambiguated by their own `label` ("Session", "Extras"), which is part
   * of the row and read out with it; the slot chip has no label by design, so
   * it names the pill instead. See `changeSlotAction` at its call site.
   */
  changeAriaLabel?: string;
  /** Re-opens the decision this row stands in for. */
  onChange: () => void;
}

/**
 * One compact recap row: what was decided, and the single affordance that
 * re-opens it.
 *
 * Two callers, and generalising to serve both was cheaper than a parallel
 * component because they differ only in what they omit. A collapsed sub-step
 * summary is `label + value + Change`; the session sub-step's slot chip is
 * `value + Info + Change`. Same border, same fill, same one-row rhythm, same
 * `ChangeAnswerButton` — and, more to the point, the same PROMISE: this row
 * states a settled decision and the control at its end is how you re-open it. A
 * second component would have been free to drift on any of that.
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
  secondaryAction,
  changeLabel,
  changeAriaLabel,
  onChange,
}: DetailsSubStepSummaryProps) {
  return (
    /* `flex-wrap` + `ml-auto`, which replaced `justify-between` + a truncating
       value: when a row does not fit, wrapping is the better failure than
       clipping, for a row whose whole job is to state a fact.

       Measured at 360px: the page's `px-4`, the form's `p-3` and this row's
       `px-3` leave about 280px. The slot chip's value is roughly 190px for
       "Sun 26 Jul · 20:30 · Any Bay", and it originally spent the rest on an
       "ⓘ Info" text link plus a "Change time or bay" pill — well past 280px, so
       it always wrapped, and the owner rightly read the two-row result as
       heavier than the session pill it was meant to echo.

       Both controls were shortened at the call site instead (icon-only Info, a
       bare "Change" with the long name moved to `aria-label`), which buys back
       roughly 90px and fits the row on a 375px phone. It can still wrap on a
       360px one, and that is the point of keeping `flex-wrap`: the fallback is
       load-bearing, not vestigial. Do not swap it back for truncation — the
       segment truncation dropped was the LAST one, the bay, which is both the
       fact the Info glyph beside it explains and the one the customer is least
       able to recover from anything else on that screen.

       The pill drops to a second line and `ml-auto` keeps it against the right
       edge on whichever line it lands, because auto margins resolve per flex
       line. The collapsed summaries are short enough that they never reach the
       wrap and are visually unchanged.

       The value deliberately does NOT grow (`min-w-0` only, no `flex-1`): if it
       absorbed the free space it would push `secondaryAction` across to the
       action cluster at the right, and the Info link has to stay against the
       bay name it belongs to. `ml-auto` is what opens the gap instead. */
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
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
      {secondaryAction}
      <ChangeAnswerButton onClick={onChange} className="ml-auto" ariaLabel={changeAriaLabel}>
        {changeLabel}
      </ChangeAnswerButton>
    </div>
  );
}
