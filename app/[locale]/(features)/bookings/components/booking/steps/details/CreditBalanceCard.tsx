'use client';

import { useTranslations, type useFormatter } from 'next-intl';
import { GiftIcon } from '@heroicons/react/24/outline';

/** One unexpired grant with hours still on it, from `/api/user/credit-balance`. */
export interface CreditGrantBalance {
  hours: number;
  /** ISO instant. */
  expiresAt: string;
}

export interface CreditBalanceCardProps {
  /**
   * `null` means NOT YET LOADED, an empty array means a real zero balance.
   * Both render nothing, but they are different states and must not be
   * collapsed into one — same `?? null` convention as the package balance in
   * `useBookingDetailsForm`.
   */
  credits: CreditGrantBalance[] | null;
  formatter: ReturnType<typeof useFormatter>;
}

/** 0.30000000000000004 → 0.3. Same helper as `PackageHoursCard`. */
function tidyHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/**
 * Free simulator hours the customer holds — today, the B1G1 hour a sub-2-hour
 * booking earned them.
 *
 * Three rules this card exists to keep:
 *
 *  1. **Nothing renders at zero.** No empty state, no "0 hours". One customer
 *     in the entire system has a balance, so the zero case is the normal case
 *     and an empty card would be noise on every single booking.
 *  2. **The expiry is always shown.** A free hour the customer never knew was
 *     expiring is worse than one they never knew about. Grants arrive
 *     soonest-expiry-first and that order is preserved.
 *  3. **It is read-only, and it is NOT in the total.** Customers cannot
 *     self-redeem (owner-confirmed) — staff apply credits from lengolf-forms.
 *     `lib/cost-calculator.ts` does not know credits exist and the estimate
 *     does not include them, so the copy says so plainly. If credits ever do
 *     reach the calculator, this copy becomes a lie and has to change with it.
 */
export function CreditBalanceCard({ credits, formatter }: CreditBalanceCardProps) {
  const t = useTranslations('bookings.detailsStep');

  // `null` (not loaded) and `[]` (genuinely nothing) both render nothing. The
  // distinction still matters upstream: a balance that has not arrived yet must
  // never be treated as a zero.
  if (!credits || credits.length === 0) return null;

  const totalHours = credits.reduce((sum, c) => sum + c.hours, 0);
  if (!(totalHours > 0)) return null;

  const formatExpiry = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    // Anchored to Bangkok: the credit expires at the end of a day at the venue,
    // and the provider sets no default timeZone.
    return formatter.dateTime(date, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Bangkok',
    });
  };

  const soonest = formatExpiry(credits[0].expiresAt);

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3 sm:p-4">
      <div className="flex items-start gap-2.5">
        <GiftIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-sm font-semibold text-emerald-900">{t('creditCardTitle')}</p>
            <p className="text-sm font-semibold text-emerald-700">
              {t('creditCardBalance', { hours: tidyHours(totalHours) })}
            </p>
          </div>

          {credits.length === 1
            ? soonest && (
                <p className="mt-1 text-xs text-emerald-800">
                  {t('creditCardExpires', { date: soonest })}
                </p>
              )
            : /* More than one grant: each carries its own deadline, so a single
                 combined date would be wrong for all but the first. */
              <ul className="mt-1 space-y-0.5">
                {credits.map((credit, index) => {
                  const date = formatExpiry(credit.expiresAt);
                  if (!date) return null;
                  return (
                    <li key={`${credit.expiresAt}-${index}`} className="text-xs text-emerald-800">
                      {t('creditCardGrantLine', {
                        hours: tidyHours(credit.hours),
                        date,
                      })}
                    </li>
                  );
                })}
              </ul>}

          {/* Read-only, and not in the estimate. Both halves are load-bearing:
              the customer must not go looking for a redeem button, and must not
              expect the total on screen to already be lower. */}
          <p className="mt-1.5 text-[11px] leading-snug text-emerald-700/90">
            {t('creditCardStaffNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
