'use client';

import { useTranslations } from 'next-intl';
import type { CostBreakdown } from '@/lib/cost-calculator';
import { ProjectedCostBreakdown } from '@/components/booking/ProjectedCostBreakdown';
import { Fact } from './SummaryRail';

type CostLanguage = 'en' | 'th' | 'ja' | 'ko' | 'zh';

/**
 * The when/where/who facts of the booking, pre-formatted by the caller.
 *
 * The localised values arrive as finished strings on purpose. `durationLabel`
 * is the very string `BookingDetails` already prints in the collapsed sub-step
 * summaries and the sticky bar's subline, and `formatDate` is the form hook's
 * own formatter — so this panel cannot render a booking differently from the
 * rest of the step by re-deriving any of it.
 *
 * `numberOfPeople` is the exception and arrives as a number, because the row
 * has a label. The flow's `peopleCountShort` string carries its own unit ("3
 * people") for the collapsed summary, which has no label to supply one; under
 * this panel's "People" label the same string read "People / 3 people". The
 * rail states the count the same way, bare.
 */
export interface BookingReviewFacts {
  selectedDate: Date;
  /** "13:00" — the slot the customer picked, as chosen. */
  selectedTime: string;
  /** e.g. "1.5 hrs". Same string as the sticky bar's subline. */
  durationLabel: string;
  /** Party size, unformatted — the "People" label already names the unit. */
  numberOfPeople: number;
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
 *
 * It owns no empty state either, for the same reason it owns no total. On
 * mobile the sticky `BookingSummaryBar` is always on screen roughly 100px
 * below, and it already prints `summaryEmptyPrompt` whenever there is no total
 * — a card here saying the same thing put the sentence on screen twice.
 */
export function BookingReviewPanel({
  selectedDate,
  selectedTime,
  durationLabel,
  numberOfPeople,
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
        {/* No payment note here. `ProjectedCostBreakdown` prints "Payment at
            venue" in its own header a few rows below, and this header printed
            the same sentence from `summaryRailPaymentNote` — the identical
            string twice on one screen. Where and when the customer pays is a
            fact about the money, so the breakdown owns it; this panel owns the
            when/where/who. The desktop `SummaryRail` keeps the note because it
            renders its own totals and never mounts alongside the breakdown. */}
        <h3 id="booking-review-title" className="text-base font-semibold text-gray-900">
          {t('reviewPanelTitle')}
        </h3>
        <p className="mt-1 text-xs text-gray-500">{t('reviewPanelIntro')}</p>

        {/* The `summaryRail*` label keys are shared with the desktop rail rather
            than duplicated under review-specific names: it is the same five
            labels, and a second set would be five more strings per locale free
            to drift out of step with the rail. */}
        <dl className="mt-3 space-y-1.5">
          <Fact label={t('summaryRailDate')} value={formatDate(selectedDate)} />
          <Fact label={t('summaryRailTime')} value={selectedTime} />
          <Fact label={t('summaryRailDuration')} value={durationLabel} />
          {/* Bare count, like the rail. The label supplies the unit. */}
          <Fact label={t('summaryRailPeople')} value={String(numberOfPeople)} />
          <Fact label={t('summaryRailBay')} value={bayLabel} />
        </dl>
      </div>

      {/* A ฿0 estimate is legitimate — a package or a free-hour credit can cover
          the whole booking — so it renders as a real total.

          No breakdown at all renders NOTHING here, deliberately. The sticky
          `BookingSummaryBar` is on screen throughout this sub-step and owns the
          empty state: it prints `summaryEmptyPrompt` for exactly this case,
          about 100px below, so a card here repeated the sentence rather than
          adding anything. And it was the wrong sentence in this position — it
          asks for a duration two rows under a Duration row that already states
          one. `ProjectedCostBreakdown` owns the in-flight case itself via
          `isLoading`, so there is no loading gap left for a placeholder to
          fill. */}
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
