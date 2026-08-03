import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { LINK_CODE_PATTERN } from '@/lib/shopeepay/adhocLink';

/**
 * GET /p/[code]
 *
 * Public short-URL redirector for staff-issued ShopeePay payment links.
 * Staff in lengolf-forms generate a link, copy the short URL (e.g.
 * https://booking.len.golf/p/CR-20260526-B626) and paste it into LINE /
 * WhatsApp / wherever they chat with the customer. On click, this route finds
 * the latest pending payment_transactions row and 302's to ShopeePay's full
 * redirect_url.
 *
 * TWO CODE SPACES, ONE ROUTE:
 *   CR-YYYYMMDD-XXXX   club rental order   -> resolves via club_rentals
 *   PL-YYYYMMDD-XXXX   ad-hoc payment link -> resolves via payment_links
 *
 * The dynamic segment is `[code]`, not `[rental_code]`, because Next.js forbids
 * two different slug names at the same path position — a sibling
 * `app/p/[adhoc_code]` is a build error. Dispatching on the prefix inside one
 * route also keeps the paid / cancelled / missing redirect semantics in a single
 * place instead of two files that must be kept in sync. The rename is internal:
 * existing /p/CR-... URLs already sitting in customers' LINE threads resolve
 * byte-identically.
 *
 * Behaviour (both spaces):
 * - Live payment found      -> 302 to ShopeePay redirect_url
 * - Already paid            -> 302 to /payment/result?ref=<code>
 * - Cancelled / refunded /
 *   expired / no live link  -> 302 to /payment/result?ref=<code>&missing=1
 * - Code not found          -> 404 with a short plain-text message
 *
 * The code is the capability — same security model as
 * /api/payments/shopeepay/create. We never echo any subject fields back to the
 * caller; a guessed code just yields a redirect to ShopeePay's own checkout page
 * (which the guesser cannot complete without the legitimate customer's app).
 */

const RENTAL_CODE_PATTERN = /^CR-\d{8}-[A-Z0-9]{1,20}$/;

/** Base URL for relative redirects (e.g. to /payment/result). */
function resultUrl(code: string, suffix: string = ''): string {
  const envBase = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  const base = envBase.replace(/\/$/, '');
  const path = `/payment/result?ref=${encodeURIComponent(code)}${suffix}`;
  return base ? `${base}${path}` : path;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!code || code.length > 32) {
    return new NextResponse('Invalid payment code', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (RENTAL_CODE_PATTERN.test(code)) return handleRental(code);
  if (LINK_CODE_PATTERN.test(code)) return handleAdhoc(code);

  return new NextResponse('Invalid payment code', {
    status: 400,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/** Club-rental branch — behaviour unchanged from the pre-rename route. */
async function handleRental(rental_code: string) {
  const supabase = createAdminClient();

  const { data: rental } = await supabase
    .from('club_rentals')
    .select('id, payment_status, status')
    .eq('rental_code', rental_code)
    .maybeSingle();

  if (!rental) {
    return new NextResponse('Payment link not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Terminal payment states — show the result page rather than hitting ShopeePay.
  if (
    rental.payment_status === 'paid' ||
    rental.payment_status === 'refunded' ||
    rental.payment_status === 'partially_refunded'
  ) {
    return NextResponse.redirect(resultUrl(rental_code), 302);
  }
  if (rental.status === 'cancelled' || rental.status === 'returned') {
    return NextResponse.redirect(resultUrl(rental_code, '&missing=1'), 302);
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

  if (!txn?.redirect_url) {
    // Rental exists but no active payment link — surface the result page so
    // the customer sees a graceful "no link" instead of a bare 404.
    return NextResponse.redirect(resultUrl(rental_code, '&missing=1'), 302);
  }

  return NextResponse.redirect(txn.redirect_url, 302);
}

/** Ad-hoc payment-link branch — mirrors handleRental cell for cell. */
async function handleAdhoc(link_code: string) {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('payment_links')
    .select('id, status')
    .eq('link_code', link_code)
    .maybeSingle();

  const link = data as { id: string; status: string } | null;

  if (!link) {
    return new NextResponse('Payment link not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (link.status === 'paid') {
    return NextResponse.redirect(resultUrl(link_code), 302);
  }
  // 'draft' is included deliberately: the row exists but was never minted, so
  // there is nothing to pay. Treat it exactly like an expired link.
  if (
    link.status === 'cancelled' ||
    link.status === 'expired' ||
    link.status === 'failed' ||
    link.status === 'draft'
  ) {
    return NextResponse.redirect(resultUrl(link_code, '&missing=1'), 302);
  }

  const { data: txnData } = await supabase
    .from('payment_transactions')
    .select('redirect_url, status')
    .eq('payment_link_id', link.id)
    .eq('status', 'pending')
    .not('redirect_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const txn = txnData as { redirect_url: string | null } | null;

  if (!txn?.redirect_url) {
    // 'pending' but no usable charge — the narrow window between the claim
    // update and the gateway response, or a mint whose post-create update failed.
    return NextResponse.redirect(resultUrl(link_code, '&missing=1'), 302);
  }

  return NextResponse.redirect(txn.redirect_url, 302);
}
