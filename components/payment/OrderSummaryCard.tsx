import { getTranslations, getFormatter } from 'next-intl/server';
import type { RentalOrderSummary } from '@/lib/shopeepay/order-summary';

/**
 * Server-rendered summary card shown above the ShopeePay handoff on
 * /payment/start. Mirrors the visual style of the course-rental review
 * step but with a more compact layout suited for a transient "you're
 * about to be redirected" page.
 *
 * Pulls translations via next-intl/server so it works as part of an RSC
 * page (no client-side useTranslations).
 */
export async function OrderSummaryCard({ summary }: { summary: RentalOrderSummary }) {
  const t = await getTranslations('payment.start');
  const format = await getFormatter();

  const formatDate = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00+07:00`), {
      timeZone: 'Asia/Bangkok',
      month: 'short',
      day: 'numeric',
    });

  return (
    <section
      className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"
      aria-labelledby="payment-summary-heading"
    >
      <h2
        id="payment-summary-heading"
        className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3"
      >
        {t('summaryHeading')}
      </h2>

      <div className="space-y-3 text-sm">
        {summary.club_set_name && (
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">{t('summaryClubSetLabel')}</span>
            <span className="font-medium text-gray-900 text-right">{summary.club_set_name}</span>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">{t('summaryDatesLabel')}</span>
          <span className="font-medium text-gray-900 text-right">
            {formatDate(summary.start_date)} → {formatDate(summary.end_date)}
            <span className="text-gray-500 font-normal">
              {' '}
              · {t('summaryDaysCount', { count: summary.duration_days })}
            </span>
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">
            {summary.delivery_requested ? t('summaryDeliveryLabel') : t('summaryPickupLabel')}
          </span>
          <span className="font-medium text-gray-900 text-right max-w-[60%] break-words">
            {summary.delivery_requested
              ? summary.delivery_address || '—'
              : 'Mercury Ville @ Chidlom'}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-gray-900">{t('summaryTotalLabel')}</span>
        <span className="text-2xl font-bold text-green-700">
          ฿{format.number(summary.total_price)}
        </span>
      </div>
    </section>
  );
}
