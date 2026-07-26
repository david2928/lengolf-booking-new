'use client';

import { useTranslations } from 'next-intl';
import type { CostBreakdown } from '@/lib/cost-calculator';
import { ProjectedCostBreakdown } from '@/components/booking/ProjectedCostBreakdown';
import { Fact } from './SummaryRail';

type CostLanguage = 'en' | 'th' | 'ja' | 'ko' | 'zh';

/**
 * The when/where/who facts of the booking, pre-formatted by the caller.
 *
 * Every value arrives as a finished string on purpose. `durationLabel` and
 * `peopleLabel` are the very strings `BookingDetails` already prints in the
 * collapsed sub-step summaries and the sticky bar's subline, and `formatDate`
 * is the form hook's own formatter — so this panel cannot render a booking
 * differently from the rest of the step by re-deriving any of it.
 */
export interface BookingReviewFacts {
  selectedDate: Date;
  /** "13:00" — the slot the customer picked, as chosen. */
  selectedTime: string;
  /** e.g. "1.5 hrs". Same string as the sticky bar's subline. */
  durationLabel: string;
  /** e.g. "2 people". Same string as the collapsed Session summary. */
  peopleLabel: string;
  /** Already-translated bay name ("Social Bay" / "AI Lab"). */
  bayLabel: string;
  /** `formatDate` from the form hook, so panel and rail format dates identically. */
  formatDate: (date: Date) => string;
}

export interface BookingReviewPanelProps extends BookingReviewFacts {
  costBreakdown: CostBreakdown | null;
  costDataLoading: boolean;
  costLanguage: CostLanguage;
}

/**
 * Mobile review panel for the last sub-step of booking step 3: a consolidated
 * "here is what you are booking" immediately above the confirm action.
 *
 * MOBILE ONLY (`lg:hidden`), and that is the whole point of the component.
 * Above `lg:` the sticky `SummaryRail` already carries these five facts, the
 * breakdown and the confirm button in one column, so a panel there would be a
 * second copy of a total roughly 300px away — the exact duplication
 * `YourDetailsStep` already avoids for the breakdown alone.
 *
 * Below `lg:` those facts were nowhere near the confirm action: the collapsed
 * Session row prints duration, bay and people but no date or start time; the
 * sticky bar's subline prints date, duration and time but truncates and names
 * neither the bay nor the party size. This panel is the first place on mobile
 * where all five sit together.
 *
 * It deliberately renders NO total of its own. The money comes from the same
 * `ProjectedCostBreakdown` this position already showed — one breakdown, one
 * total, both read off the caller's single `costBreakdown` object, which is the
 * same object the sticky bar totals. Adding a second total here is how a panel
 * ends up disagreeing with the bar it sits under.
 *
 * Line items already name the Play & Food set, the club rental and each add-on
 * (see `lib/cost-calculator.ts`), and `ProjectedCostBreakdown` already prints
 * discounts and `pickNotes` — the package shortfall warning, the Early Bird
 * split, the best-offer disclosure and the bogo hint. So the customer never
 * confirms a number without the sentence that explains it.
 */
export function BookingReviewPanel({
  selectedDate,
  selectedTime,
  durationLabel,
  peopleLabel,
  bayLabel,
  formatDate,
  costBreakdown,
  costDataLoading,
  costLanguage,
}: BookingReviewPanelProps) {
  const t = useTranslations('bookings.detailsStep');

  return (
    <section aria-labelledby="booking-review-title" className="mt-4 space-y-4 lg:hidden">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="booking-review-title" className="text-base font-semibold text-gray-900">
            {t('reviewPanelTitle')}
          </h3>
          <span className="text-xs text-gray-400">{t('summaryRailPaymentNote')}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('reviewPanelIntro')}</p>

        {/* The `summaryRail*` label keys are shared with the desktop rail rather
            than duplicated under review-specific names: it is the same five
            labels, and a second set would be five more strings per locale free
            to drift out of step with the rail. */}
        <dl className="mt-3 space-y-1.5">
          <Fact label={t('summaryRailDate')} value={formatDate(selectedDate)} />
          <Fact label={t('summaryRailTime')} value={selectedTime} />
          <Fact label={t('summaryRailDuration')} value={durationLabel} />
          <Fact label={t('summaryRailPeople')} value={peopleLabel} />
          <Fact label={t('summaryRailBay')} value={bayLabel} />
        </dl>
      </div>

      {/* A ฿0 estimate is legitimate — a package or a free-hour credit can cover
          the whole booking — so it renders as a real total. Only a breakdown
          that does not exist yet falls through to the empty prompt, matching
          both the rail and `BookingSummaryBar`. */}
      {costBreakdown ? (
        <ProjectedCostBreakdown
          breakdown={costBreakdown}
          isLoading={costDataLoading}
          language={costLanguage}
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">{t('summaryEmptyPrompt')}</p>
        </div>
      )}
    </section>
  );
}
