'use client';

import { useTranslations, type useFormatter } from 'next-intl';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { PackageCoverage } from '@/lib/package-coverage';

export interface PackageHoursCardProps {
  /** From `computePackageCoverage`. The parent renders nothing when it is null. */
  coverage: PackageCoverage;
  /** CRM name, e.g. `"Gold (30H)"`. Brand data — deliberately untranslated. */
  packageDisplayName?: string;
  totalHours: number | null;
  usedHours: number | null;
  /** `yyyy-MM-dd` or null. */
  expiryDate: string | null;
  formatter: ReturnType<typeof useFormatter>;
}

/** 0.30000000000000004 → 0.3. Keeps float dust out of the printed hours. */
function tidyHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/**
 * `yyyy-MM-dd` → a LOCAL midnight Date. `new Date('2026-08-31')` parses as UTC
 * midnight, which renders as the 30th anywhere west of Greenwich — the expiry
 * date is a calendar date, not an instant.
 */
function parseCalendarDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Remaining package hours, and — when the balance will not stretch across the
 * booking — what the uncovered tail costs.
 *
 * The overage figure is INSIDE the estimated total. `lib/cost-calculator.ts`
 * takes the same balance and charges the uncovered tail as its own bay line, so
 * the warning and the total quote the same money — the card explains the charge
 * rather than disclaiming it. Keep that copy honest: if the calculator ever
 * stops consuming the balance, this note becomes a lie. The agreement is pinned
 * in `__tests__/package-coverage.test.ts`.
 */
export function PackageHoursCard({
  coverage,
  packageDisplayName,
  totalHours,
  usedHours,
  expiryDate,
  formatter,
}: PackageHoursCardProps) {
  const t = useTranslations('bookings.detailsStep');

  const {
    bookingHours,
    coversWholeBooking,
    coveredHours,
    shortfallHours,
    shortfallCost,
    isPartial,
    remainingAfter,
    isUnlimited,
  } = coverage;

  /**
   * Always disclosed when there is one. The customer still needs to know their
   * package will not stretch across the booking, even though the estimate now
   * contains the charge — a package holder does not expect a bay line at all.
   */
  const showOverage = isPartial && shortfallCost !== null;

  const expiry = expiryDate ? parseCalendarDate(expiryDate) : null;

  // Two segments: hours the CRM already records as used (dark), then what this
  // booking would draw down on top (light). The caption below labels only the
  // CRM figure — the booking's own draw is spelled out in words underneath
  // rather than in the caption, so the segments stay unlabelled by design.
  //
  // Both segments derive from `usedHours`/`totalHours` while the "left after"
  // line derives from `remainingHours`. Those agree whenever
  // used + remaining === total; where the CRM has adjustments or a partial
  // expiry they can drift, and the worded lines are the ones to trust.
  const hasMeter = !isUnlimited && totalHours !== null && totalHours > 0 && usedHours !== null;
  const usedPct = hasMeter ? Math.min(100, (usedHours! / totalHours!) * 100) : 0;
  const bookingPct = hasMeter
    ? Math.min(100 - usedPct, (coveredHours / totalHours!) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-green-200 bg-green-50/60 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-green-900">
          {packageDisplayName || t('packageCardTitle')}
        </p>
        {expiry && (
          <p className="text-[11px] text-green-700/80 flex-shrink-0">
            {t('packageCardExpires', {
              date: formatter.dateTime(expiry, { day: 'numeric', month: 'short', year: 'numeric' }),
            })}
          </p>
        )}
      </div>

      {isUnlimited ? (
        <p className="mt-1.5 text-xs font-medium text-green-800">{t('packageCardUnlimited')}</p>
      ) : (
        <>
          {hasMeter && (
            <>
              <div
                className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-green-200/70"
                role="presentation"
              >
                <div className="h-full bg-green-600" style={{ width: `${usedPct}%` }} />
                {/* This booking's draw-down, distinct from hours already used. */}
                <div className="h-full bg-green-400" style={{ width: `${bookingPct}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-green-800">
                {t('packageCardHoursUsed', {
                  used: tidyHours(usedHours!),
                  total: tidyHours(totalHours!),
                })}
              </p>
            </>
          )}
          <div className="mt-1 space-y-0.5">
            {coveredHours > 0 && (
              <p className="text-xs text-green-800">
                {t('packageCardThisBooking', { hours: tidyHours(coveredHours) })}
              </p>
            )}
            {remainingAfter !== null && (
              <p className="text-xs font-semibold text-green-900">
                {t('packageCardLeftAfter', { hours: tidyHours(remainingAfter) })}
              </p>
            )}
          </div>
        </>
      )}

      {/* State B — the package runs out mid-booking. Shown before submit, which
          is the whole point of the slice: today the customer discovers this at
          the bay when staff charge the difference. */}
      {showOverage && (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5"
          role="status"
        >
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-xs font-semibold text-amber-900">{t('packageCardOverageTitle')}</p>
            <p className="mt-0.5 text-xs leading-snug text-amber-800">
              {coversWholeBooking
                ? t('packageCardOverageBody', {
                    covered: tidyHours(coveredHours),
                    total: tidyHours(bookingHours),
                    uncovered: tidyHours(shortfallHours),
                    amount: formatter.number(shortfallCost!),
                  })
                : /* A 14:00-capped (Early Bird) package. `covered + shortfall`
                     is the eligible window, NOT the booking, so this variant
                     must not claim a booking total — the hours would not add
                     up, and the post-14:00 remainder is a bay line of its own
                     in the breakdown. */
                  t('packageCardOverageBodyCapped', {
                    covered: tidyHours(coveredHours),
                    uncovered: tidyHours(shortfallHours),
                    amount: formatter.number(shortfallCost!),
                  })}
            </p>
            <p className="mt-1 text-[11px] text-amber-700">{t('packageCardOverageNote')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
