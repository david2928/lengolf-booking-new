import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createAdminClient } from '@/utils/supabase/admin';
import { loadRentalOrderSummary } from '@/lib/shopeepay/order-summary';
import { OrderSummaryCard } from '@/components/payment/OrderSummaryCard';
import { ShopeepayWordmark } from '@/components/payment/ShopeepayWordmark';
import { HandoffClient } from './HandoffClient';

/**
 * Payment hand-off page.
 *
 * Modern checkout pattern: render the order summary server-side
 * BEFORE we mint a payment intent or talk to ShopeePay. The customer
 * sees what they're paying for, the total, and the gateway brand
 * before being redirected. The HandoffClient island then asynchronously
 * calls /api/payments/shopeepay/create and redirects.
 *
 * Failure modes:
 *   - Missing or unknown rental_code → render a friendly "we couldn't
 *     find that reservation" view with a back link.
 *   - Rental exists but isn't a course rental → same as above
 *     (loadRentalOrderSummary returns null for non-course rentals).
 *   - Network/gateway failure during create → handled in HandoffClient.
 */
export default async function PaymentStartPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const t = await getTranslations('payment.start');

  if (!ref) {
    return <MissingRefView />;
  }

  const supabase = createAdminClient();
  const summary = await loadRentalOrderSummary(supabase, ref);

  if (!summary) {
    return <MissingRefView />;
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="w-full max-w-md mx-auto space-y-4">
        <OrderSummaryCard summary={summary} />

        {/* Gateway branding — trust signal that the redirect is intentional. */}
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-1">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span>{t('poweredByLabel')}</span>
          <ShopeepayWordmark className="text-sm" />
        </div>

        <HandoffClient rentalCode={ref} />

        <p className="text-xs text-gray-500 text-center px-2">{t('handoffNote')}</p>
      </div>
    </main>
  );
}

async function MissingRefView() {
  const t = await getTranslations('payment.start');
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="mx-auto mb-6 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.5M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('errorTitle')}</h1>
        <p className="text-sm text-gray-600 mb-6">{t('missingRefBody')}</p>
        <Link
          href="/course-rental"
          className="block w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
        >
          {t('backCta')}
        </Link>
      </div>
    </main>
  );
}
