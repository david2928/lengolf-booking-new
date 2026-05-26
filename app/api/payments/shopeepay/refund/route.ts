import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createRefund } from '@/lib/shopeepay/client';
import { claimAndSendRefundEmail } from '@/lib/shopeepay/markRefundAsRefunded';
import { composeRentalLineMessage } from '@/lib/club-rental/lineMessage';

/**
 * POST /api/payments/shopeepay/refund
 *
 * Backoffice-initiated refund flow. ShopeePay does NOT currently emit
 * a refund-status webhook (confirmed by their support 2026-05-24), so
 * this route is the source of truth: it calls ShopeePay's refund API
 * synchronously and writes our DB based on the API response. The
 * (dormant) handleRefundNotify in lib/shopeepay/ will start firing
 * IN ADDITION if/when ShopeePay ships their refund webhook — it's
 * idempotent against the rows this route creates.
 *
 * Auth: bearer token. The backoffice (lengolf-forms) holds the
 * matching secret in BACKOFFICE_API_TOKEN and sends it in the
 * Authorization header. The token must be 32+ characters and present
 * for the route to function; otherwise this endpoint returns 503 so
 * staff see a clear "not configured" message rather than a silent
 * unauthorized.
 *
 * Body shape:
 *   {
 *     rental_code: string,        // CR-...
 *     amount?: number,            // satang (THB * 100); defaults to remaining
 *     reason?: string             // optional refund reason
 *   }
 *
 * Success response shape:
 *   {
 *     success: true,
 *     refund: {
 *       id: <uuid>,
 *       refund_reference_id: <string>,
 *       refund_sn: <string | null>,
 *       amount_satang: <number>,
 *       new_txn_status: 'refunded' | 'partially_refunded',
 *     }
 *   }
 *
 * Failure responses use standard HTTP status codes; the body always
 * includes `{ error: string }`.
 */

const BACKOFFICE_TOKEN_MIN_LENGTH = 32;

interface RefundBody {
  rental_code?: string;
  amount?: number;
  reason?: string;
  initiated_by_email?: string;
}

function verifyBearerToken(request: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const expected = process.env.BACKOFFICE_API_TOKEN;
  if (!expected || expected.length < BACKOFFICE_TOKEN_MIN_LENGTH) {
    return {
      ok: false,
      status: 503,
      message:
        'Refund endpoint is not configured. Set BACKOFFICE_API_TOKEN (32+ chars) in this environment.',
    };
  }

  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Missing or malformed Authorization header' };
  }

  const presented = header.slice('Bearer '.length).trim();
  if (presented.length !== expected.length) {
    return { ok: false, status: 401, message: 'Invalid token' };
  }

  // Constant-time compare to avoid timing attacks. Cheap defense for a
  // bearer-token check.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    return { ok: false, status: 401, message: 'Invalid token' };
  }
  return { ok: true };
}

function getBaseUrl(): string {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (baseUrl && !baseUrl.startsWith('http')) return `http://${baseUrl}`;
  if (!baseUrl && process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return baseUrl;
}

const IS_PROD_ENV = process.env.VERCEL_ENV === 'production';

export async function POST(request: NextRequest) {
  // 1. Auth
  const auth = verifyBearerToken(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  // 2. Parse + validate body
  let body: RefundBody;
  try {
    body = (await request.json()) as RefundBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rental_code, amount: requestedAmount, reason, initiated_by_email } = body;

  if (!rental_code || typeof rental_code !== 'string' || rental_code.length > 32) {
    return NextResponse.json({ error: 'rental_code is required' }, { status: 400 });
  }
  if (requestedAmount !== undefined && (!Number.isInteger(requestedAmount) || requestedAmount <= 0)) {
    return NextResponse.json(
      { error: 'amount must be a positive integer in satang (or omit for full remaining refund)' },
      { status: 400 }
    );
  }
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) {
    return NextResponse.json({ error: 'reason must be a string ≤ 500 chars' }, { status: 400 });
  }
  if (
    initiated_by_email !== undefined &&
    (typeof initiated_by_email !== 'string' || initiated_by_email.length > 254)
  ) {
    return NextResponse.json({ error: 'initiated_by_email is invalid' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 3. Load rental + linked parent payment_transaction
  const { data: rental, error: rentalError } = await supabase
    .from('club_rentals')
    .select('id, rental_code, payment_status, payment_transaction_id')
    .eq('rental_code', rental_code)
    .single();

  if (rentalError || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (!rental.payment_transaction_id) {
    return NextResponse.json(
      { error: 'Rental has no ShopeePay transaction to refund' },
      { status: 409 }
    );
  }

  const { data: parentTxn, error: txnError } = await supabase
    .from('payment_transactions')
    .select(
      'id, payment_reference_id, amount, refunded_amount, status, gateway'
    )
    .eq('id', rental.payment_transaction_id)
    .single();

  if (txnError || !parentTxn) {
    return NextResponse.json({ error: 'Parent transaction not found' }, { status: 404 });
  }
  if (parentTxn.gateway !== 'shopeepay') {
    return NextResponse.json(
      { error: `Refund via this endpoint is only available for ShopeePay (got ${parentTxn.gateway})` },
      { status: 400 }
    );
  }
  if (parentTxn.status !== 'success' && parentTxn.status !== 'partially_refunded') {
    return NextResponse.json(
      {
        error: `Cannot refund a transaction in status '${parentTxn.status}' (must be 'success' or 'partially_refunded')`,
      },
      { status: 409 }
    );
  }

  // 4. Compute refund amount + remaining cap
  const alreadyRefunded = parentTxn.refunded_amount ?? 0;
  const remainingSatang = parentTxn.amount - alreadyRefunded;
  if (remainingSatang <= 0) {
    return NextResponse.json(
      { error: 'Transaction is already fully refunded' },
      { status: 409 }
    );
  }
  const refundAmountSatang = requestedAmount ?? remainingSatang;
  if (refundAmountSatang > remainingSatang) {
    return NextResponse.json(
      {
        error: `amount ${refundAmountSatang} exceeds remaining refundable ${remainingSatang} satang`,
      },
      { status: 400 }
    );
  }

  // 5. Generate refund_reference_id. Count existing refunds for this txn
  //    to pick the next suffix. UNIQUE constraint on refund_reference_id
  //    catches the race window if two requests interleave.
  const { count: existingRefundCount, error: countErr } = await supabase
    .from('payment_refunds')
    .select('id', { count: 'exact', head: true })
    .eq('payment_transaction_id', parentTxn.id);

  if (countErr) {
    console.error('[ShopeePay/refund] count existing refunds failed:', countErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const refundIndex = (existingRefundCount ?? 0) + 1;
  const refundReferenceId = `${parentTxn.payment_reference_id}-R${refundIndex}`;
  const requestId = `lengolf-rfd-${rental.rental_code}-${Date.now()}`;

  // 6. Insert pending payment_refunds row BEFORE calling ShopeePay so
  //    we have a paper trail even if the gateway call fails or times out.
  const { data: refundRow, error: insertErr } = await supabase
    .from('payment_refunds')
    .insert({
      payment_transaction_id: parentTxn.id,
      refund_reference_id: refundReferenceId,
      request_id: requestId,
      amount: refundAmountSatang,
      reason: reason ?? 'Refund issued via backoffice',
      status: 'pending',
      initiated_by_email: initiated_by_email ?? 'backoffice@lengolf',
      initiated_by_name: 'Backoffice',
    })
    .select('id')
    .single();

  if (insertErr || !refundRow) {
    // Likely a UNIQUE violation on refund_reference_id — concurrent request raced.
    console.error('[ShopeePay/refund] payment_refunds insert failed:', insertErr);
    return NextResponse.json(
      {
        error:
          'Failed to record refund intent (possibly a concurrent refund for the same transaction). Try again.',
      },
      { status: 409 }
    );
  }

  // 7. Call ShopeePay refund API
  let gatewayResp;
  try {
    gatewayResp = await createRefund({
      request_id: requestId,
      // ShopeePay's refund endpoint uses `reference_id` (matches their
      // transaction/check naming), NOT `payment_reference_id` — confirmed
      // by pearpearpearpearpear 2026-05-25. Our DB column stays
      // `payment_reference_id` (semantically the same value).
      reference_id: parentTxn.payment_reference_id,
      refund_reference_id: refundReferenceId,
      amount: refundAmountSatang,
      reason: reason ?? undefined,
    });
  } catch (e) {
    console.error('[ShopeePay/refund] gateway call failed:', e);
    await supabase
      .from('payment_refunds')
      .update({
        status: 'failed',
        error_message: (e as Error).message?.slice(0, 500) ?? 'unknown',
      })
      .eq('id', refundRow.id);
    return NextResponse.json(
      { error: 'Payment gateway is not reachable. Please try again.' },
      { status: 502 }
    );
  }

  if (gatewayResp.errcode !== 0) {
    console.error('[ShopeePay/refund] gateway returned error:', gatewayResp);
    await supabase
      .from('payment_refunds')
      .update({
        status: 'failed',
        error_code: gatewayResp.errcode,
        error_message: gatewayResp.debug_msg?.slice(0, 500) ?? null,
        raw_create_response: gatewayResp as unknown as Record<string, unknown>,
      })
      .eq('id', refundRow.id);
    return NextResponse.json(
      {
        error: `Payment gateway rejected the refund (errcode=${gatewayResp.errcode}): ${gatewayResp.debug_msg ?? 'no message'}`,
      },
      { status: 502 }
    );
  }

  // 8. SUCCESS PATH — write DB synchronously.

  const refundedAt = new Date().toISOString();
  const newRefundedAmount = alreadyRefunded + refundAmountSatang;
  const newTxnStatus =
    newRefundedAmount >= parentTxn.amount ? 'refunded' : 'partially_refunded';

  // 8a. Flip the refund row to success.
  const { error: refundUpdateErr } = await supabase
    .from('payment_refunds')
    .update({
      status: 'success',
      refund_sn: gatewayResp.refund_sn ?? null,
      refunded_at: refundedAt,
      raw_create_response: gatewayResp as unknown as Record<string, unknown>,
    })
    .eq('id', refundRow.id);

  if (refundUpdateErr) {
    console.error('[ShopeePay/refund] post-success refund row update failed:', refundUpdateErr);
    // Don't fail the response — the gateway already accepted the refund.
  }

  // 8b. Update the parent transaction.
  const { error: txnUpdateErr } = await supabase
    .from('payment_transactions')
    .update({
      refunded_amount: newRefundedAmount,
      status: newTxnStatus,
      refunded_at: refundedAt,
    })
    .eq('id', parentTxn.id);

  if (txnUpdateErr) {
    console.error('[ShopeePay/refund] parent transaction update failed:', txnUpdateErr);
    // Don't fail the response — gateway has the truth; staff can reconcile.
  }

  // 8c. Update the rental's payment_status — and for a FULL refund, also
  // flip the lifecycle status to 'cancelled' so the slot frees up.
  // The availability query in /api/clubs/availability filters on
  // status IN ('reserved','picked_up'); without this, a fully-refunded
  // rental would silently keep blocking other customers from booking
  // that set on the same dates. Partial refunds leave status alone —
  // the rental is still active for the remaining balance.
  const rentalUpdates: Record<string, unknown> = { payment_status: newTxnStatus };
  if (newTxnStatus === 'refunded') {
    rentalUpdates.status = 'cancelled';
  }

  const { error: rentalUpdateErr } = await supabase
    .from('club_rentals')
    .update(rentalUpdates)
    .eq('id', rental.id);

  if (rentalUpdateErr) {
    console.error('[ShopeePay/refund] rental status update failed:', rentalUpdateErr);
  }

  // 8d. Fire customer email + staff LINE ping — best-effort.
  // AWAIT so Vercel doesn't tear down the function mid-fetch (same
  // class of bug as the webhook hit on 2026-05-26 with the void-fire
  // pattern). Wrap in try/catch so the refund response still succeeds
  // even if the email side-effect fails.
  try {
    await claimAndSendRefundEmail(supabase, refundRow.id, {
      refundSn: gatewayResp.refund_sn ?? null,
    });
  } catch (err) {
    console.error('[ShopeePay/refund] email side-effect failed:', err);
  }

  const baseUrl = getBaseUrl();
  if (baseUrl) {
    // Re-fetch the rental + club set so the LINE message has all the
    // details (skeleton matches the rest of the lifecycle pings).
    const { data: rentalForLine } = await supabase
      .from('club_rentals')
      .select('*')
      .eq('id', rental.id)
      .single();

    if (rentalForLine) {
      const { data: clubSet } = rentalForLine.rental_club_set_id
        ? await supabase
            .from('rental_club_sets')
            .select('name, tier, gender')
            .eq('id', rentalForLine.rental_club_set_id)
            .single()
        : { data: null };

      const lineMessage = composeRentalLineMessage({
        rental: rentalForLine,
        clubSet,
        status:
          newTxnStatus === 'refunded'
            ? {
                kind: 'Refunded',
                refundedSatang: refundAmountSatang,
                refundSn: gatewayResp.refund_sn ?? null,
              }
            : {
                kind: 'PartiallyRefunded',
                refundedThisTimeSatang: refundAmountSatang,
                totalRefundedSatang: newRefundedAmount,
                refundSn: gatewayResp.refund_sn ?? null,
              },
        uatPrefix: !IS_PROD_ENV,
      });

      try {
        await fetch(`${baseUrl}/api/notifications/line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: lineMessage }),
        });
      } catch (err) {
        console.error('[ShopeePay/refund] LINE notification error:', err);
      }
    }
  }

  // 9. Return success
  return NextResponse.json({
    success: true,
    refund: {
      id: refundRow.id,
      refund_reference_id: refundReferenceId,
      refund_sn: gatewayResp.refund_sn ?? null,
      amount_satang: refundAmountSatang,
      new_txn_status: newTxnStatus,
    },
  });
}
