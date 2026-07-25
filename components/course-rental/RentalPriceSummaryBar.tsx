'use client';

import { useFormatter } from 'next-intl';
import { BookingSummaryBar } from '@/components/shared/BookingSummaryBar';

interface RentalPriceSummaryBarProps {
  rentalPrice: number;
  /** Savings vs paying all 1-day rates; 0 if no multi-day discount applies. */
  savings: number;
  /** Delivery fee in THB (0 if no delivery). Resolved by the parent. */
  deliveryFee: number;
  addOnsTotal: number;
  durationDays: number;
  /** 'set' | 'delivery' | 'contact' | 'review' */
  currentStep: string;
  ctaLabel: string;
  onCta: () => void;
  ctaLoading?: boolean;
  emptyPrompt?: string;
}

/**
 * Course-rental wrapper over the shared BookingSummaryBar. Keeps the
 * rental-specific subline (days, savings, delivery) here and the layout in one
 * shared place, so the bay flow and this flow cannot drift apart visually.
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
  const isReview = currentStep === 'review';

  // Preserves the original behaviour exactly: the bar only showed a total once a
  // date range existed, so a priced-but-dateless state still shows the prompt.
  const hasTotal = total > 0 && durationDays > 0;

  // Built as JSX (not a joined string) so the savings/delivery segments keep
  // their original colour cues — green for a discount, amber for a surcharge —
  // which a plain string subline cannot carry.
  const subline = isReview ? undefined : (
    <>
      {durationDays}d
      {savings > 0 && (
        <span className="text-green-600"> · save ฿{format.number(savings)}</span>
      )}
      {deliveryFee > 0 && (
        <span className="text-amber-600"> · +฿{format.number(deliveryFee)} delivery</span>
      )}
    </>
  );

  return (
    <BookingSummaryBar
      total={hasTotal ? total : null}
      totalLabel="Total"
      subline={subline}
      ctaLabel={ctaLabel}
      onCta={onCta}
      ctaLoading={ctaLoading}
      emptyPrompt={emptyPrompt}
    />
  );
}
