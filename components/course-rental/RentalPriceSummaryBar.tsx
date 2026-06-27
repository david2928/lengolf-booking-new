'use client';

import { useFormatter } from 'next-intl';

interface RentalPriceSummaryBarProps {
  rentalPrice: number;
  /** Savings vs paying all 1-day rates; 0 if no multi-day discount applies. */
  savings: number;
  /** Delivery fee in THB (0 if no delivery). Passed from parent which resolves dynamic pricing. */
  deliveryFee: number;
  addOnsTotal: number;
  durationDays: number;
  /** 'set' | 'delivery' | 'contact' | 'review' */
  currentStep: string;
  /** Primary action label (Continue / Review Booking / Pay now / Confirm). */
  ctaLabel: string;
  /** Fires the step's primary action. Validation + jump-to-error lives in the parent. */
  onCta: () => void;
  /** Show a spinner + disable the CTA (review submit in flight). */
  ctaLoading?: boolean;
  /** Left-side prompt shown when the total is still 0 (e.g. set step, nothing picked). */
  emptyPrompt?: string;
}

/**
 * Persistent bottom action bar: running total on the left, the step's primary
 * button on the right. Always visible so the customer never scrolls to advance.
 * The button is always tappable — the parent validates on tap and scrolls to the
 * first incomplete required field rather than greying the button out.
 */
export function RentalPriceSummaryBar({
  rentalPrice,
  savings,
  deliveryFee,
  addOnsTotal,
  durationDays,
  currentStep,
  ctaLabel,
  onCta,
  ctaLoading,
  emptyPrompt,
}: RentalPriceSummaryBarProps) {
  const format = useFormatter();

  const total = rentalPrice + deliveryFee + addOnsTotal;
  const hasTotal = total > 0 && durationDays > 0;
  const isReview = currentStep === 'review';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          {hasTotal ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Total</p>
              <p className="text-lg font-bold leading-tight text-green-700">฿{format.number(total)}</p>
              {!isReview && (
                <p className="truncate text-[11px] text-gray-400">
                  {durationDays}d
                  {savings > 0 && <span className="text-green-600"> · save ฿{format.number(savings)}</span>}
                  {deliveryFee > 0 && <span className="text-amber-600"> · +฿{format.number(deliveryFee)} delivery</span>}
                </p>
              )}
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
