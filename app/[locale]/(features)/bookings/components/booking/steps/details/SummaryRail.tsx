'use client';

import { useTranslations } from 'next-intl';
import type { CostBreakdown, CostLineItem } from '@/lib/cost-calculator';
import {
  CostItemAmount,
  CostItemPackageBadge,
  formatCurrency,
  pickDetail,
  pickLabel,
  pickNotes,
} from '@/components/booking/ProjectedCostBreakdown';

type CostLanguage = 'en' | 'th' | 'ja' | 'ko' | 'zh';

export interface SummaryRailProps {
  costBreakdown: CostBreakdown | null;
  costDataLoading: boolean;
  costLanguage: CostLanguage;
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  numberOfPeople: number;
  /** Already-translated bay name ("Social Bay" / "AI Lab"). */
  bayLabel: string;
  ctaLabel: string;
  /** Always the confirm action — desktop has no sub-steps to advance through. */
  onCta: () => void;
  ctaLoading?: boolean;
  /** `formatDate` from the form hook, so rail and form format dates identically. */
  formatDate: (date: Date) => string;
}

/** The line items whose `detail` carries a prorated rate mix. */
const PRORATED_ITEM_IDS = new Set(['bay-rate', 'bay-rate-covered']);

/**
 * Break a bay-rate detail into one entry per prorated portion.
 *
 * `lib/cost-calculator.ts` (`buildBayRateDetail`) emits a booking that crosses
 * 14:00 or 17:00 as ONE `bay-rate` line item whose already-localized detail
 * reads `"2hr × ฿550 + 1hr × ฿750 (Weekday)"`. In a 296px column that wraps
 * into an unreadable run-on, and this split is the number customers query most,
 * so the rail gives each portion its own line and hangs the day/slot label
 * underneath.
 *
 * This is a display-only transform of a string the calculator already produced
 * and translated — deliberately NOT a recomputation, so the rail can never
 * disagree with the form about the rate mix. Per-portion *amounts* are
 * intentionally absent: the breakdown does not expose them, and rounding
 * `hours × price` per portion does not always sum to the item's own rounded
 * total, so a rail that failed to add up would be worse than one that shows the
 * rate mix against a single reconciled amount.
 *
 * Returns `null` when there is nothing to split, so the caller falls back to
 * rendering the detail unchanged.
 */
export function splitProratedDetail(
  detail: string,
): { portions: string[]; qualifier: string | null } | null {
  const withQualifier = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(detail);
  const body = withQualifier ? withQualifier[1] : detail;
  const qualifier = withQualifier ? withQualifier[2] : null;
  const portions = body.split(' + ');
  if (portions.length < 2) return null;
  return { portions, qualifier };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 text-right">{value}</dd>
    </div>
  );
}

function RailLineItem({
  item,
  language,
}: {
  item: CostLineItem;
  language: CostLanguage;
}) {
  const detail = pickDetail(item, language);
  const split = detail && PRORATED_ITEM_IDS.has(item.id) ? splitProratedDetail(detail) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-gray-700">{pickLabel(item, language)}</span>
        <CostItemAmount item={item} language={language} />
      </div>
      {split ? (
        <>
          <ul className="mt-1 pl-4 list-disc list-outside space-y-0.5 marker:text-gray-300">
            {split.portions.map((portion, i) => (
              <li key={`${item.id}-portion-${i}`} className="text-xs text-gray-500">
                {portion}
              </li>
            ))}
          </ul>
          {split.qualifier && (
            <p className="mt-0.5 text-xs text-gray-400">{split.qualifier}</p>
          )}
        </>
      ) : (
        detail && <p className="mt-0.5 text-xs text-gray-400">{detail}</p>
      )}
      {item.isCoveredByPackage && <CostItemPackageBadge item={item} language={language} />}
    </div>
  );
}

/**
 * Desktop-only right column of booking step 3: what the customer chose, what it
 * costs broken down per prorated portion, and the confirm action.
 *
 * `onCta` must be the form hook's `handlePrimaryCta` (in its confirm mode) —
 * the rail owns no validation of its own, so jump-to-error stays in one place.
 *
 * Positioning (`hidden lg:block lg:sticky lg:top-6`) lives with the two-column
 * grid in `BookingDetails.tsx`, not here, so this component stays layout-
 * agnostic and testable on its own.
 */
export function SummaryRail({
  costBreakdown,
  costDataLoading,
  costLanguage,
  selectedDate,
  selectedTime,
  duration,
  numberOfPeople,
  bayLabel,
  ctaLabel,
  onCta,
  ctaLoading,
  formatDate,
}: SummaryRailProps) {
  const t = useTranslations('bookings.detailsStep');
  const notes = costBreakdown ? pickNotes(costBreakdown, costLanguage) : [];

  return (
    <section
      aria-labelledby="summary-rail-title"
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="summary-rail-title" className="text-base font-semibold text-gray-900">
          {t('summaryRailTitle')}
        </h3>
        <span className="text-xs text-gray-400">{t('summaryRailPaymentNote')}</span>
      </div>

      <dl className="mt-3 space-y-1.5">
        <Fact label={t('summaryRailDate')} value={formatDate(selectedDate)} />
        <Fact label={t('summaryRailTime')} value={selectedTime} />
        <Fact label={t('summaryRailDuration')} value={t('summaryRailHours', { hours: duration })} />
        <Fact label={t('summaryRailPeople')} value={String(numberOfPeople)} />
        <Fact label={t('summaryRailBay')} value={bayLabel} />
      </dl>

      {costDataLoading ? (
        <div className="mt-4 border-t border-gray-200 pt-3 space-y-3 animate-pulse">
          <div className="h-4 w-full rounded bg-gray-200" />
          <div className="h-4 w-2/3 rounded bg-gray-200" />
          <div className="h-4 w-1/2 rounded bg-gray-200" />
        </div>
      ) : costBreakdown ? (
        <>
          <div className="mt-4 border-t border-gray-200 pt-3 space-y-3">
            {costBreakdown.lineItems.map((item) => (
              <RailLineItem key={item.id} item={item} language={costLanguage} />
            ))}
          </div>

          {costBreakdown.discounts.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-dashed border-gray-200 pt-3">
              {costBreakdown.discounts.map((discount) => (
                <div key={discount.id} className="flex items-baseline justify-between">
                  <span className="text-sm text-green-700">
                    {pickLabel(discount, costLanguage)}
                  </span>
                  <span className="ml-4 whitespace-nowrap text-sm font-medium text-green-600">
                    -{formatCurrency(Math.abs(discount.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-baseline justify-between border-t border-gray-200 pt-3">
            <span className="text-sm font-semibold text-gray-900">{t('summaryTotalLabel')}</span>
            <span className="text-lg font-bold tabular-nums text-gray-900">
              {formatCurrency(costBreakdown.estimatedTotal)}
            </span>
          </div>

          {notes.length > 0 && (
            <div className="mt-3 space-y-1">
              {notes.map((note, i) => (
                <p key={i} className="text-xs text-gray-400">
                  {note}
                </p>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-4 border-t border-gray-200 pt-3 text-sm text-gray-500">
          {t('summaryEmptyPrompt')}
        </p>
      )}

      {/* Outside the `<form>` (it is the grid's other column), hence
          `type="button"` plus an explicit handler rather than a submit. */}
      <button
        type="button"
        onClick={onCta}
        disabled={ctaLoading}
        aria-busy={ctaLoading || undefined}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait disabled:bg-green-700"
      >
        {ctaLoading && (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
          />
        )}
        {ctaLabel}
      </button>
    </section>
  );
}
