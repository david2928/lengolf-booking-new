import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifySignature } from '@/lib/shopeepay/client';
import { isFinalSuccess, type NotifyTransactionPayload } from '@/lib/shopeepay/types';
import { sendCourseRentalConfirmationEmail, resolveEmailLocale } from '@/lib/emailService';

/**
 * POST /api/webhooks/shopeepay
 *
 * Receives ShopeePay's "Notify Transaction Status" callback. Verifies
 * the HMAC signature, checks idempotency on transaction_sn, and on
 * confirmed success (status=3 or transaction_status=3 per the CwS UAT
 * self-assessment) flips the rental's payment_status to 'paid' and
 * fires the customer confirmation email + staff LINE notification.
 *
 * Per the partner UAT guideline:
 *   - Always respond { errcode: 0, debug_msg: 'success' } on rows we
 *     recognize, even on idempotent replays. Thailand retries up to 2x
 *     at 5-min intervals on non-zero responses.
 *   - Never use the `return_url` redirect as proof of success — the
 *     webhook (or the Check Transaction Status fallback) is the only
 *     trusted source.
 */

const ACK_OK = { errcode: 0, debug_msg: 'success' as const };

function getBaseUrl(): string {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (baseUrl && !baseUrl.startsWith('http')) return `http://${baseUrl}`;
  if (!baseUrl && process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return baseUrl;
}

export async function POST(request: NextRequest) {
  // Read the body as text BEFORE parsing — signature is computed over
  // the exact bytes ShopeePay sent, and JSON.stringify(JSON.parse(x))
  // is not always equal to x.
  const rawBody = await request.text();
  const headerSig = request.headers.get('x-airpay-req-h');

  if (!verifySignature(rawBody, headerSig)) {
    console.warn('[ShopeePay/webhook] signature verification failed');
    // Returning 401 (not errcode:0) so ShopeePay retries — but only
    // when the signature really is bad. Don't include any body so we
    // don't echo info back to potential probes.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: NotifyTransactionPayload;
  try {
    payload = JSON.parse(rawBody) as NotifyTransactionPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { payment_reference_id, transaction_sn, amount } = payload;
  if (!payment_reference_id) {
    return NextResponse.json({ error: 'Missing payment_reference_id' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: txnRow, error: txnError } = await supabase
    .from('payment_transactions')
    .select(
      'id, club_rental_id, amount, status, transaction_sn, payment_reference_id, raw_webhook_payload'
    )
    .eq('payment_reference_id', payment_reference_id)
    .maybeSingle();

  if (txnError) {
    console.error('[ShopeePay/webhook] DB lookup error:', txnError);
    // Server-side issue — return non-zero so ShopeePay retries.
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!txnRow) {
    console.warn(
      `[ShopeePay/webhook] no transaction found for ${payment_reference_id} — ignoring`
    );
    // Don't surface this as a non-zero — if it's a stale/replayed
    // webhook for a deleted record, we don't want infinite retries.
    return NextResponse.json(ACK_OK);
  }

  // Amount tampering check.
  if (typeof amount !== 'number' || amount !== txnRow.amount) {
    console.error(
      `[ShopeePay/webhook] amount mismatch for ${payment_reference_id}: ` +
        `expected ${txnRow.amount}, got ${amount}`
    );
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  // Idempotency: if we already recorded this transaction_sn AND the
  // row is already in a terminal state, ack and skip side effects.
  if (
    transaction_sn &&
    txnRow.transaction_sn === transaction_sn &&
    (txnRow.status === 'success' || txnRow.status === 'failed')
  ) {
    return NextResponse.json(ACK_OK);
  }

  const isSuccess = isFinalSuccess(payload);

  // Update the transaction row in all cases (we've now verified sig +
  // amount). raw_webhook_payload is overwritten on each delivery — fine
  // because every delivery for a given transaction_sn carries the same
  // terminal payload by ShopeePay's contract.
  const newTxnStatus = isSuccess ? 'success' : payload.status === undefined ? 'pending' : 'failed';

  const txnUpdates: Record<string, unknown> = {
    status: newTxnStatus,
    raw_webhook_payload: payload as unknown as Record<string, unknown>,
  };
  if (transaction_sn) txnUpdates.transaction_sn = transaction_sn;
  if (typeof payload.payment_channel === 'number') {
    txnUpdates.payment_channel = payload.payment_channel;
  }
  if (payload.payment_method) txnUpdates.payment_method = payload.payment_method;
  if (payload.user_id_hash) txnUpdates.user_id_hash = payload.user_id_hash;
  if (isSuccess) txnUpdates.paid_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('payment_transactions')
    .update(txnUpdates)
    .eq('id', txnRow.id);

  if (updateError) {
    console.error('[ShopeePay/webhook] transaction update failed:', updateError);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (!isSuccess) {
    // Failed / non-terminal payload — update the rental to 'failed' if
    // ShopeePay returned a non-success terminal state, otherwise leave
    // it 'pending' and let the cleanup cron expire it.
    if (newTxnStatus === 'failed' && txnRow.club_rental_id) {
      await supabase
        .from('club_rentals')
        .update({ payment_status: 'failed' })
        .eq('id', txnRow.club_rental_id);
    }
    return NextResponse.json(ACK_OK);
  }

  // ----- Success path -----

  if (!txnRow.club_rental_id) {
    console.warn(
      `[ShopeePay/webhook] success but no club_rental_id linked for ${payment_reference_id}`
    );
    return NextResponse.json(ACK_OK);
  }

  // Flip the rental and clear expiry. Side-effect order:
  //   1. DB write (must succeed)
  //   2. Email send (best-effort, async)
  //   3. LINE staff notification (best-effort, async)
  // Use select('*') to keep the Database row type — multi-column
  // concatenated select strings break supabase-js type inference.
  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .update({ payment_status: 'paid', expires_at: null })
    .eq('id', txnRow.club_rental_id)
    .select('*')
    .single();

  if (rentalErr || !rental) {
    console.error('[ShopeePay/webhook] rental update failed:', rentalErr);
    // The transaction is updated; the rental update is what fires the
    // confirmation. Return non-zero so ShopeePay retries and gives us
    // another shot.
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // Resolve locale: customer profile preferred_language → fallback English.
  let language: string | null = null;
  if (rental.customer_id) {
    const { data: customerLang } = await supabase
      .from('customers')
      .select('preferred_language')
      .eq('id', rental.customer_id)
      .single();
    language = customerLang?.preferred_language ?? null;
  }
  const emailLocale = resolveEmailLocale(language);

  // Look up the club set for the email body.
  const { data: clubSet } = await supabase
    .from('rental_club_sets')
    .select('name, tier, gender')
    .eq('id', rental.rental_club_set_id)
    .single();

  if (rental.customer_email && clubSet) {
    const addOns = Array.isArray(rental.add_ons)
      ? (rental.add_ons as Array<{ label: string; price: number }>).map(a => ({
          label: a.label,
          price: a.price,
        }))
      : [];
    const deliveryTimeStr = [
      rental.delivery_time
        ? `${rental.delivery_requested ? 'Delivery' : 'Pickup'}: ${rental.delivery_time}`
        : '',
      rental.return_time ? `Return: ${rental.return_time}` : '',
    ]
      .filter(Boolean)
      .join(', ');

    sendCourseRentalConfirmationEmail({
      customerName: rental.customer_name,
      email: rental.customer_email,
      rentalCode: rental.rental_code,
      clubSetName: clubSet.name,
      clubSetTier: clubSet.tier,
      clubSetGender: clubSet.gender,
      startDate: rental.start_date,
      endDate: rental.end_date,
      durationDays: rental.duration_days || 1,
      deliveryRequested: !!rental.delivery_requested,
      deliveryAddress: rental.delivery_address ?? undefined,
      deliveryTime: deliveryTimeStr || undefined,
      addOns,
      rentalPrice: Number(rental.rental_price),
      deliveryFee: Number(rental.delivery_fee || 0),
      totalPrice: Number(rental.total_price),
      notes: rental.notes ?? undefined,
      language: emailLocale,
      paymentStatus: 'paid',
      transactionSn: transaction_sn ?? undefined,
    }).catch(err => console.error('[ShopeePay/webhook] email send error:', err));
  }

  // Staff LINE notification. Fire-and-forget.
  const baseUrl = getBaseUrl();
  if (baseUrl) {
    const lineMessage = [
      `Payment Received (${rental.rental_code})`,
      `Customer: ${rental.customer_name}`,
      `Amount: ฿${(Number(rental.total_price) || 0).toLocaleString()}`,
      transaction_sn ? `Txn: ${transaction_sn}` : null,
      rental.delivery_requested ? `Delivery to: ${rental.delivery_address ?? ''}` : 'Pickup at LENGOLF',
    ]
      .filter(Boolean)
      .join('\n');

    fetch(`${baseUrl}/api/notifications/line`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lineMessage }),
    }).catch(err => console.error('[ShopeePay/webhook] LINE notification error:', err));
  }

  return NextResponse.json(ACK_OK);
}
