'use client';

import { useEffect } from 'react';
import { useFormatter } from 'next-intl';

/** Bottom padding a consumer must apply to its scroll container to clear this bar. */
export const BOOKING_SUMMARY_BAR_SPACER = 'pb-28';

// Refcounts how many BookingSummaryBar instances are currently mounted, so
// the `has-summary-bar` body class (see the useEffect below and the CSS rule
// in app/globals.css) is only removed once the LAST instance unmounts.
// Without this, overlapping mounts — e.g. an App Router transition that
// streams in a new page while the old subtree is still mounted — cause the
// first instance to unmount and strip the class while a second instance is
// still on screen, silently dropping the chat FAB back onto a live bar.
let summaryBarMountCount = 0;

interface BookingSummaryBarProps {
  /**
   * Running total in THB, or `null` when nothing is priced yet. `null` shows
   * `emptyPrompt` instead of an amount. Any number — including `0` — renders
   * as a real total: a fully-covered booking (package or free hours)
   * legitimately costs ฿0 and must not be mistaken for "nothing chosen yet".
   * Non-finite (`NaN`/`Infinity`) or negative values are treated the same as
   * `null` defensively — they should never happen, but an unresolved rate or
   * a `reduce` over partially-loaded pricing data can produce `NaN`, and we
   * must never render that to a paying customer.
   */
  total: number | null;
  /** Uppercase micro-label above the amount, e.g. "Total". */
  totalLabel: string;
  /** One-line detail under the amount, e.g. "1.5 h, 13:00 to 14:30". */
  subline?: string;
  /** Primary action label. */
  ctaLabel: string;
  /** Fires the step's primary action. Validation lives in the parent. */
  onCta: () => void;
  /** Spinner + disable, for a submit in flight. The ONLY reason to disable. */
  ctaLoading?: boolean;
  /** Shown instead of the amount when total is null. */
  emptyPrompt?: string;
}

/**
 * Persistent bottom action bar: running total left, primary action right.
 *
 * The button is ALWAYS tappable unless a submit is in flight. The parent
 * validates on tap and scrolls to the first incomplete field. Do not
 * reintroduce a disabled-for-validation state: a grey button that does not say
 * what is missing is the dead end this replaces.
 */
export function BookingSummaryBar({
  total,
  totalLabel,
  subline,
  ctaLabel,
  onCta,
  ctaLoading,
  emptyPrompt,
}: BookingSummaryBarProps) {
  const format = useFormatter();
  const showTotal = total !== null && Number.isFinite(total) && total >= 0;

  // The chat FAB (components/chat/ChatButton.tsx) is a fixed z-50 element
  // that renders on the same pages this bar mounts on (see the
  // `has-summary-bar` rule in app/globals.css for the full explanation).
  // Flagging our presence via a body class keeps the two components
  // decoupled — neither needs to import or know about the other. Refcounted
  // via summaryBarMountCount so overlapping mounts (see comment above that
  // module-level counter) don't let one instance's unmount strip the class
  // out from under a still-mounted sibling.
  useEffect(() => {
    summaryBarMountCount += 1;
    document.body.classList.add('has-summary-bar');
    return () => {
      summaryBarMountCount -= 1;
      if (summaryBarMountCount === 0) {
        document.body.classList.remove('has-summary-bar');
      }
    };
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 pb-safe sm:px-6">
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          {showTotal ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {totalLabel}
              </p>
              <p className="text-lg font-bold leading-tight text-green-700 tabular-nums">
                {/* Display rounds half-up (e.g. 1012.5 -> ฿1,013); the
                    charged amount may still carry a half-baht fraction from
                    proration across the 14:00/17:00 rate boundary. Do not
                    "fix" this into a floor — overstating by half a baht is
                    the safe display direction. */}
                ฿{format.number(total, { maximumFractionDigits: 0 })}
              </p>
              {subline && <p className="truncate text-[11px] text-gray-500">{subline}</p>}
            </>
          ) : (
            <p className="text-sm text-gray-500">{emptyPrompt}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onCta}
          disabled={ctaLoading}
          aria-busy={ctaLoading || undefined}
          className="flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:bg-green-700 disabled:cursor-wait"
        >
          {ctaLoading && (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            />
          )}
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
