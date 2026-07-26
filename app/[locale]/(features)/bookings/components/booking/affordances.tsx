'use client';

import type { ComponentType, ReactNode, SVGProps } from 'react';
import { InformationCircleIcon, PencilSquareIcon } from '@heroicons/react/24/outline';

/**
 * The two secondary affordances the booking flow is allowed to put beside a
 * heading or a summary row, and the rule that decides which one a new link is.
 *
 * THE RULE
 *
 *   Does activating this change the booking or move the customer?
 *
 *     No  → `RevealDetailsButton`. Quiet grey text with an info glyph. It opens
 *           an overlay, the customer reads it, closes it, and is exactly where
 *           they were. Nothing they have chosen is at risk.
 *     Yes → `ChangeAnswerButton`. A bordered green pill with a pencil glyph. It
 *           re-opens a decision that was already made, which means leaving the
 *           spot they are standing on.
 *
 * Green is the flow's "this touches your booking" colour and is spent ONLY on
 * the second kind. Grey means "this only tells you something".
 *
 * WHY THIS FILE EXISTS
 *
 * "Change" and "View Details" rendered a few rows apart as the same green
 * underlined text at nearly the same size. Identical affordance, opposite
 * consequence: one loses your place in a half-filled form, the other cannot
 * cost you anything. The owner flagged it on the QA build.
 *
 * The grey-for-informational half of the rule was already half-built and half
 * broken before this: the bay "Info" link and the time step's "What's the
 * difference?" were grey, while the two "View Details" and both "Learn about
 * our bay types" were green. Three sites were the exception to a convention
 * two other sites already followed. This file finishes it and makes the
 * convention a component, so the next link inherits its bucket instead of
 * copying whichever neighbour it was pasted next to.
 *
 * SCOPE
 *
 * Standalone affordances only — the thing sitting at the end of a heading row
 * or a summary row. Links written INSIDE a sentence (the food/drink menu links
 * in the step 1 facility list, the external course-rental link in the club
 * modal) keep the underline, because inside running prose the underline is what
 * marks the words as a link at all. Those are prose, not controls.
 */

interface AffordanceProps {
  onClick: () => void;
  /** Already-localised label. */
  children: ReactNode;
  /** Layout-only additions from the call site, e.g. `mt-1`. */
  className?: string;
}

/**
 * Opens a read-only overlay. Costs the customer nothing, so it is drawn as the
 * quietest interactive thing on the row.
 *
 * `type="button"` is load-bearing on every one of these: several render inside
 * the booking `<form>`, where a button with no explicit type defaults to
 * `submit` and would fire the booking.
 */
export function RevealDetailsButton({ onClick, children, className = '' }: AffordanceProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-gray-500 transition-colors hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 ${className}`}
    >
      <InformationCircleIcon className="h-4 w-4" aria-hidden="true" />
      {children}
    </button>
  );
}

export interface ChangeAnswerButtonProps extends AffordanceProps {
  /**
   * `warning` is for the one of these that lives inside an amber callout, where
   * green would read as a second, competing status colour rather than as an
   * action. Same shape, same weight, borrowed palette.
   */
  tone?: 'default' | 'warning';
  /** Defaults to a pencil. Pass an arrow where the action is literally "back". */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * Re-opens a decision the customer already made. Drawn as a control with a
 * border, because it behaves like one: it moves them, or swaps a read-only
 * recap for live inputs.
 */
export function ChangeAnswerButton({
  onClick,
  children,
  className = '',
  tone = 'default',
  icon: Icon = PencilSquareIcon,
}: ChangeAnswerButtonProps) {
  const palette =
    tone === 'warning'
      ? 'border-yellow-500 text-yellow-800 hover:bg-yellow-100 focus-visible:ring-yellow-600'
      : 'border-green-600 text-green-700 hover:bg-green-50 focus-visible:ring-green-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${palette} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </button>
  );
}
