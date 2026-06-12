import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * GET /p/[rental_code]
 *
 * Public short-URL redirector for staff-issued ShopeePay payment links.
 * Staff in lengolf-forms generate a payment link, copy the short URL
 * (e.g. https://booking.len.golf/p/CR-20260526-B626) and paste it into
 * LINE / WhatsApp / wherever they chat with the customer. On click, this
 * route looks up the latest pending payment_transactions row for that
 * rental and 302's to ShopeePay's full redirect_url.
 *
 * Behaviour:
 * - Pending ShopeePay link found → 302 to ShopeePay redirect_url (parallel-run window)
 * - Otherwise payable            → 302 to /payment/checkout?ref=<code> (Opn inline card flow)
 * - Rental paid                  → 302 to /payment/result?ref=<code>  (existing page renders the paid state)
 * - Rental cancelled / refunded  → 302 to /payment/result?ref=<code>&missing=1
 * - rental_code not found        → 404 with a short HTML message
 *
 * The rental_code is the capability — same security model as
 * /api/payments/shopeepay/create. We never echo any rental fields back
 * to the caller; a guessed code just yields a redirect to ShopeePay's
 * own checkout page (which the guesser cannot complete without the
 * legitimate customer's ShopeePay app).
 */

const RENTAL_CODE_PATTERN = /^CR-\d{8}-[A-Z0-9]{1,20}$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ rental_code: string }> }
) {
  const { rental_code } = await params;

  if (!rental_code || rental_code.length > 32 || !RENTAL_CODE_PATTERN.test(rental_code)) {
    return new NextResponse('Invalid rental code', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const supabase = createAdminClient();

  const { data: rental } = await supabase
    .from('club_rentals')
    .select('id, payment_status, status')
    .eq('rental_code', rental_code)
    .maybeSingle();

  if (!rental) {
    return new NextResponse('Payment link not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  // Build a base URL for relative redirects (e.g. to /payment/result).
  // The request is already on this domain, so prefer the request's origin
  // when reachable, falling back to known env vars.
  function resultUrl(suffix: string = ''): string {
    const envBase = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
    const base = envBase.replace(/\/$/, '');
    const path = `/payment/result?ref=${encodeURIComponent(rental_code)}${suffix}`;
    return base ? `${base}${path}` : path;
  }

  // Terminal payment states — show the result page rather than hitting ShopeePay.
  if (rental.payment_status === 'paid' || rental.payment_status === 'refunded' || rental.payment_status === 'partially_refunded') {
    return NextResponse.redirect(resultUrl(), 302);
  }
  if (rental.status === 'cancelled' || rental.status === 'returned') {
    return NextResponse.redirect(resultUrl('&missing=1'), 302);
  }

  // Find the most recent pending payment_transactions row for this rental.
  const { data: txn } = await supabase
    .from('payment_transactions')
    .select('redirect_url, status')
    .eq('club_rental_id', rental.id)
    .eq('status', 'pending')
    .not('redirect_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (txn?.redirect_url) {
    // Legacy ShopeePay link still in flight — honor it during the
    // parallel-run window.
    return NextResponse.redirect(txn.redirect_url, 302);
  }

  // Opn flow: there is no gateway-hosted URL until the customer submits
  // the card form, so the payment link IS our own checkout page. Any
  // still-payable rental (guards above filtered paid/refunded/cancelled)
  // lands on /payment/checkout, whose preflight re-validates expiry and
  // lifecycle server-side.
  const envBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  const checkoutPath = `/payment/checkout?ref=${encodeURIComponent(rental_code)}`;
  return NextResponse.redirect(envBase ? `${envBase}${checkoutPath}` : checkoutPath, 302);
}
