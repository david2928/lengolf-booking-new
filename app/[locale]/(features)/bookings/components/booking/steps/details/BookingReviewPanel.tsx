'use client';

import type { CostBreakdown } from '@/lib/cost-calculator';
import { ProjectedCostBreakdown } from '@/components/booking/ProjectedCostBreakdown';

type CostLanguage = 'en' | 'th' | 'ja' | 'ko' | 'zh';

export interface BookingReviewPanelProps {
  costBreakdown: CostBreakdown | null;
  costDataLoading: boolean;
  costLanguage: CostLanguage;
}

/**
 * The money, immediately above the confirm action, on mobile.
 *
 * WHAT THIS IS NOT, ANY MORE. It opened with a "Review your booking" card
 * listing Date, Time, Duration, People and Bay. Every one of those five is
 * already on this screen: the step header's subline states the date, the start
 * time and the bay, and the collapsed Session and Extras rows state the
 * duration, the party size and the add-ons — each with a Change that reopens
 * the decision, which a read-only card never offered. The owner asked whether
 * the screen was odd; it was saying everything twice, and printing the date in
 * two different formats about a finger's width apart while doing it
 * ("Thu 30 Jul" in the rows against "Thu, 30 Jul 2026" here).
 *
 * So the facts went and the cost stayed, because the cost is the one thing on
 * this screen that appears nowhere else: the rate, the weekday band it was
 * calculated from, and the total.
 *
 * MOBILE ONLY (`lg:hidden`). Above `lg:` the sticky `SummaryRail` carries the
 * facts, the breakdown and the confirm button in one column, so anything here
 * would be a second copy about 300px away.
 *
 * It renders NO total of its own — `ProjectedCostBreakdown` owns the money, and
 * both it and the sticky bar read the caller's single `costBreakdown` object.
 * Two totals is how a panel ends up disagreeing with the bar beneath it. Line
 * items already name the Play & Food set, the club rental and each add-on, and
 * the breakdown prints discounts and `pickNotes` — the package shortfall, the
 * Early Bird split, the best-offer disclosure — so the customer never confirms
 * a number without the sentence explaining it.
 *
 * It owns no empty state either. The sticky `BookingSummaryBar` sits about
 * 100px below throughout this sub-step and prints `summaryEmptyPrompt` when
 * there is no total, so a card here would repeat it. `ProjectedCostBreakdown`
 * handles the in-flight case via `isLoading`, leaving no gap for a placeholder.
 *
 * With the facts gone this is a thin wrapper, and deliberately kept as one: the
 * decisions above — mobile-only, no total, no empty state — are the component,
 * and inlining it at the call site would scatter them.
 */
export function BookingReviewPanel({
  costBreakdown,
  costDataLoading,
  costLanguage,
}: BookingReviewPanelProps) {
  /* No `aria-labelledby` and no heading of its own: `ProjectedCostBreakdown`
     renders its own "Estimated Cost" <h3>, so a wrapper heading here would put
     two labels on one region. Without a name this is not a landmark, which is
     correct — it is a layout wrapper, and the breakdown inside it is the thing
     with a name. The test id exists because that leaves nothing else to select
     it by. */
  return (
    <section data-testid="booking-review-panel" className="mt-4 lg:hidden">
      {costBreakdown && (
        <ProjectedCostBreakdown
          breakdown={costBreakdown}
          isLoading={costDataLoading}
          language={costLanguage}
        />
      )}
    </section>
  );
}
