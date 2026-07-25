'use client';

import { useFormatter } from 'next-intl';

interface BookingSummaryBarProps {
  /** Running total in THB. */
  total: number;
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
  /** Shown instead of the amount when there is nothing priced yet. */
  emptyPrompt?: string;
  /**
   * Treat a total of 0 as a real price rather than "nothing chosen yet".
   * Needed because a fully-covered booking (package or free hours) legitimately
   * costs ฿0 and must not render as an empty prompt.
   */
  isZeroValid?: boolean;
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
  isZeroValid,
}: BookingSummaryBarProps) {
  const format = useFormatter();
  const showTotal = isZeroValid || total > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          {showTotal ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                {totalLabel}
              </p>
              <p className="text-lg font-bold leading-tight text-green-700 tabular-nums">
                ฿{format.number(total)}
              </p>
              {subline && <p className="truncate text-[11px] text-gray-500">{subline}</p>}
            </>
          ) : (
            <p className="text-sm text-gray-400">{emptyPrompt}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onCta}
          disabled={ctaLoading}
          className="flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-400"
        >
          {ctaLoading && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
