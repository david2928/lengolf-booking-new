import { redirect } from 'next/navigation';
import { routing } from '@/i18n/routing';

/**
 * Opn-cutover compatibility redirect.
 *
 * /payment/start was the ShopeePay hand-off page — its <HandoffClient>
 * minted a ShopeePay order via /api/payments/shopeepay/create. On the Opn
 * branch the customer pays inline at /payment/checkout, so this page must
 * NOT be a live destination: a customer landing here (stale link, bookmark,
 * direct nav) could otherwise create a ShopeePay order while the rest of the
 * flow is on Opn — a mixed-gateway state. Redirect any arrival to the Opn
 * checkout, preserving ref + locale.
 *
 * The original ShopeePay hand-off page is retained in git history for the
 * post-cutover rollback window (revert the branch to restore it).
 */
export default async function PaymentStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { locale } = await params;
  const { ref } = await searchParams;
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  redirect(
    ref
      ? `${prefix}/payment/checkout?ref=${encodeURIComponent(ref)}`
      : `${prefix}/course-rental`
  );
}
