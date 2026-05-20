import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { loadRentalOrderSummary } from '@/lib/shopeepay/order-summary';

/**
 * GET /api/payments/shopeepay/summary?ref=<rental_code>
 *
 * Returns the order summary the customer is about to pay for, so the
 * /payment/start page can render trust-and-transparency content
 * (line items, total, delivery vs pickup) BEFORE we mint a payment
 * intent and redirect to ShopeePay.
 *
 * Read-only. No payment_transactions row is created here. Same threat
 * model as /status: knowing the rental_code is the capability, and
 * everything returned is already known to the customer who just
 * created the rental.
 */
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  if (!ref || ref.length > 32 || !/^[A-Za-z0-9-]+$/.test(ref)) {
    return NextResponse.json({ error: 'Invalid ref' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const summary = await loadRentalOrderSummary(supabase, ref);

  if (!summary) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }

  return NextResponse.json({ summary });
}
