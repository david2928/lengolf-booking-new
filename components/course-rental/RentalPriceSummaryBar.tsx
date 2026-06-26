'use client';

import { useFormatter } from 'next-intl';
import type { RentalClubSetWithAvailability } from '@/types/golf-club-rental';
import { getCoursePriceBreakdown } from '@/types/golf-club-rental';

interface RentalPriceSummaryBarProps {
  selectedSet: RentalClubSetWithAvailability | null;
  durationDays: number;
  /** Delivery fee in THB (0 if no delivery). Passed from parent which resolves dynamic pricing. */
  deliveryFee: number;
  addOnsTotal: number;
  /** 'set' | 'delivery' | 'contact' | 'review' */
  currentStep: string;
}

export function RentalPriceSummaryBar({
  selectedSet,
  durationDays,
  deliveryFee,
  addOnsTotal,
  currentStep,
}: RentalPriceSummaryBarProps) {
  const format = useFormatter();

  if (!selectedSet || durationDays <= 0) return null;

  const breakdown = getCoursePriceBreakdown(selectedSet, durationDays);
  const total = breakdown.total + deliveryFee + addOnsTotal;

  // On review step the full breakdown is visible — show only total to avoid repetition.
  const isReview = currentStep === 'review';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
        {isReview ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Total</span>
            <span className="text-lg font-bold text-green-700">฿{format.number(total)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500 truncate">
                {selectedSet.name} · {durationDays}d
                {breakdown.savings > 0 && (
                  <span className="ml-1 text-green-600">
                    (save ฿{format.number(breakdown.savings)})
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-gray-400">฿{format.number(breakdown.total)} rental</span>
                {deliveryFee > 0 && (
                  <span className="text-xs text-amber-600">+ ฿{format.number(deliveryFee)} delivery</span>
                )}
                {addOnsTotal > 0 && (
                  <span className="text-xs text-gray-400">+ ฿{format.number(addOnsTotal)} add-ons</span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total</p>
              <p className="text-lg font-bold text-green-700">฿{format.number(total)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
