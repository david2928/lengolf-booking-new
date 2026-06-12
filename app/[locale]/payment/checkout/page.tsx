import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createAdminClient } from '@/utils/supabase/admin';
import { loadRentalOrderSummary } from '@/lib/payments/order-summary';
import { OrderSummaryCard } from '@/components/payment/OrderSummaryCard';
import { PoweredByOpn } from '@/components/payment/PoweredByOpn';
import { opnConfig } from '@/lib/opn/config';
import { PayElement } from './PayElement';

/**
 * Opn Payments card-form checkout page.
 *
 * Server Component — loads the rental summary, runs three preflight
 * checks before rendering the form:
 *   1. MissingRef   — `ref` query param absent or unknown rental_code
 *   2. AlreadyPaid  — `payment_status === 'paid'` (user revisiting after success)
 *   3. Expired      — `expires_at` is in the past (link TTL exceeded)
 *
 * Happy-path renders: OrderSummaryCard + PayElement (client island) +
 * PoweredByOpn branding + SAQ-A note.
 *
 * The publicKey (pkey_*) is browser-exposable by design — it is
 * Opn's public tokenisation key, not the secret API key.
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { locale } = await params;
  const { ref } = await searchParams;
  const t = await getTranslations('payment.checkout');

  if (!ref) return <MissingRefView />;

  const supabase = createAdminClient();
  const summary = await loadRentalOrderSummary(supabase, ref);
  if (!summary) return <MissingRefView />;

  if (summary.payment_status === 'paid') return <AlreadyPaidView ref={ref} />;
  // Lifecycle guard: the cleanup cron cancels by setting status='cancelled'
  // AND expires_at=NULL, so the expiry check alone would happily render a
  // payable form for a cancelled rental (whose club set may be rebooked).
  // Refunded rentals are also non-payable. The intent route re-validates
  // server-side; this just spares the customer a doomed form.
  if (summary.status && summary.status !== 'reserved') return <ExpiredView />;
  if (
    summary.payment_status === 'refunded' ||
    summary.payment_status === 'partially_refunded'
  )
    return <ExpiredView />;
  if (summary.expires_at && new Date(summary.expires_at) < new Date())
    return <ExpiredView />;

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="w-full max-w-md mx-auto space-y-4">
        <OrderSummaryCard summary={summary} />
        <PayElement
          rentalCode={ref}
          amount={summary.total_price}
          publicKey={opnConfig.publicKey}
          locale={locale}
        />
        <PoweredByOpn />
        <p className="text-xs text-gray-500 text-center px-2">{t('saqaNote')}</p>
      </div>
    </main>
  );
}

async function MissingRefView() {
  const t = await getTranslations('payment.checkout');
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
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

async function AlreadyPaidView({ ref }: { ref: string }) {
  const t = await getTranslations('payment.checkout');
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('alreadyPaidTitle')}</h1>
        <p className="text-sm text-gray-600 mb-6">{t('alreadyPaidBody')}</p>
        <Link
          href={`/payment/return?ref=${ref}`}
          className="block w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
        >
          {t('viewReceiptCta')}
        </Link>
      </div>
    </main>
  );
}

async function ExpiredView() {
  const t = await getTranslations('payment.checkout');
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('expiredTitle')}</h1>
        <p className="text-sm text-gray-600 mb-6">{t('expiredBody')}</p>
        <Link
          href="/course-rental"
          className="block w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
        >
          {t('newBookingCta')}
        </Link>
      </div>
    </main>
  );
}
