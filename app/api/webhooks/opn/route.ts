import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyPayload } from '@/lib/opn/signature';
import { webhookSecrets } from '@/lib/opn/config';
import { claimAndSendConfirmationEmail } from '@/lib/payments/markRentalAsPaid';
import { handleRefundNotify } from '@/lib/opn/handleRefundNotify';
import {
  isChargeSuccessful,
  type OpnCharge,
  type OpnRefund,
  type OpnWebhookEvent,
} from '@/lib/opn/types';

const ACK_OK = { object: 'ok' as const };

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
  const rawBody = await request.text();
  const headerSig = request.headers.get('omise-signature');
  const headerTs = request.headers.get('omise-signature-timestamp');

  if (!verifyPayload(rawBody, headerSig, headerTs, webhookSecrets())) {
    console.warn('[opn/webhook] signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Anti-replay: reject if more than 5 min skew.
  const tsMs = Number(headerTs) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60_000) {
    console.warn('[opn/webhook] stale or invalid timestamp:', headerTs);
    return NextResponse.json({ error: 'Stale timestamp' }, { status: 401 });
  }

  let event: OpnWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.key) {
    case 'charge.complete':
      return handleChargeComplete(supabase, event.data as OpnCharge);
    case 'charge.create':
      return NextResponse.json(ACK_OK);
    case 'refund.create':
      return handleRefundNotify(supabase, event.data as OpnRefund, { baseUrl: getBaseUrl() });
    default:
      console.log('[opn/webhook] unhandled event key:', event.key);
      return NextResponse.json(ACK_OK);
  }
}

async function handleChargeComplete(supabase: ReturnType<typeof createAdminClient>, charge: OpnCharge): Promise<Response> {
  const { data: txn, error: txnErr } = await supabase
    .from('payment_transactions')
    .select('id, club_rental_id, amount, status')
    .eq('gateway_charge_id', charge.id)
    .maybeSingle();

  if (txnErr) {
    console.error('[opn/webhook] txn lookup failed:', txnErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!txn) {
    console.warn(`[opn/webhook] no txn for charge ${charge.id} — ack and ignore`);
    return NextResponse.json(ACK_OK);
  }

  if (charge.amount !== txn.amount) {
    console.error(
      `[opn/webhook] amount mismatch for ${charge.id}: expected ${txn.amount}, got ${charge.amount}`
    );
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  if (txn.status === 'success' || txn.status === 'failed') {
    return NextResponse.json(ACK_OK);
  }

  const isSuccess = isChargeSuccessful(charge);
  const updates: Record<string, unknown> = {
    status: isSuccess ? 'success' : 'failed',
    raw_webhook_payload: charge as unknown as Record<string, unknown>,
    auth_code: (charge as { authorization_code?: string | null }).authorization_code ?? null,
    failure_code: charge.failure_code,
    failure_message: charge.failure_message,
    card_brand: charge.card?.brand ?? null,
    card_last4: charge.card?.last_digits ?? null,
    is_3ds: charge.authorize_uri !== null,
    transaction_fee_rate: charge.transaction_fees?.fee_rate ?? null,
    transaction_vat_rate: charge.transaction_fees?.vat_rate ?? null,
  };
  if (isSuccess) updates.paid_at = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('payment_transactions')
    .update(updates)
    .eq('id', txn.id);

  if (updateErr) {
    console.error('[opn/webhook] txn update failed:', updateErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (!isSuccess) {
    if (txn.club_rental_id) {
      await supabase
        .from('club_rentals')
        .update({ payment_status: 'failed' })
        .eq('id', txn.club_rental_id);
    }
    return NextResponse.json(ACK_OK);
  }

  if (!txn.club_rental_id) {
    console.warn(`[opn/webhook] success but no club_rental_id for ${charge.id}`);
    return NextResponse.json(ACK_OK);
  }

  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .update({ payment_status: 'paid', expires_at: null })
    .eq('id', txn.club_rental_id)
    .select('*')
    .single();

  if (rentalErr || !rental) {
    console.error('[opn/webhook] rental update failed:', rentalErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  void claimAndSendConfirmationEmail(supabase, txn.id, txn.club_rental_id, {
    transactionRef: charge.id,
  });

  const baseUrl = getBaseUrl();
  if (baseUrl) {
    const lineMessage = [
      `Payment Received (${rental.rental_code})`,
      `Customer: ${rental.customer_name}`,
      `Amount: ฿${(Number(rental.total_price) || 0).toLocaleString()}`,
      `Charge: ${charge.id}`,
      rental.delivery_requested ? `Delivery to: ${rental.delivery_address ?? ''}` : 'Pickup at LENGOLF',
    ].join('\n');

    fetch(`${baseUrl}/api/notifications/line`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lineMessage }),
    }).catch(err => console.error('[opn/webhook] LINE notification error:', err));
  }

  return NextResponse.json(ACK_OK);
}
