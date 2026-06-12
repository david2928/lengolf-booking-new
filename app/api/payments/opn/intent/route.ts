import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createCharge } from '@/lib/opn/client';
import { classifyFailure, isChargeSuccessful } from '@/lib/opn/types';
import { createHash } from 'crypto';

interface IntentBody {
  rental_code?: string;
  token?: string;
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

export async function POST(request: NextRequest) {
  let body: IntentBody;
  try {
    body = (await request.json()) as IntentBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rental_code, token } = body;
  if (!rental_code || typeof rental_code !== 'string' || rental_code.length > 32) {
    return NextResponse.json({ error: 'rental_code is required' }, { status: 400 });
  }
  if (!token || typeof token !== 'string' || !token.startsWith('tokn_')) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .select('id, rental_code, rental_type, total_price, payment_status, customer_name, expires_at')
    .eq('rental_code', rental_code)
    .single();

  if (rentalErr || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (rental.rental_type !== 'course') {
    return NextResponse.json({ error: 'Online payment is not available for this rental type' }, { status: 400 });
  }
  if (rental.payment_status === 'paid') {
    return NextResponse.json({ error: 'This rental has already been paid' }, { status: 409 });
  }
  if (rental.expires_at && new Date(rental.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This reservation has expired' }, { status: 410 });
  }

  const amountSatang = Math.round(Number(rental.total_price) * 100);
  if (!Number.isFinite(amountSatang) || amountSatang <= 0) {
    return NextResponse.json({ error: 'Rental has an invalid price' }, { status: 500 });
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const returnUri = `${baseUrl}/payment/return?ref=${rental.rental_code}`;

  // Insert pending row BEFORE calling Omise — paper trail even on timeout.
  const { data: txnRow, error: txnInsertErr } = await supabase
    .from('payment_transactions')
    .insert({
      club_rental_id: rental.id,
      gateway: 'opn',
      gateway_token_id: token,
      amount: amountSatang,
      currency: 'THB',
      status: 'pending',
      return_url: returnUri,
    })
    .select('id')
    .single();

  if (txnInsertErr || !txnRow) {
    console.error('[opn/intent] txn insert failed:', txnInsertErr);
    return NextResponse.json({ error: 'Failed to record payment intent' }, { status: 500 });
  }

  const idempotencyKey = createHash('sha256')
    .update(`${rental_code}:${token}`)
    .digest('hex');

  let charge;
  try {
    charge = await createCharge({
      amountSatang,
      currency: 'thb',
      cardToken: token,
      returnUri,
      metadata: { rental_code, txn_id: txnRow.id },
      idempotencyKey,
    });
  } catch (e) {
    const msg = (e as Error).message?.slice(0, 500) ?? 'unknown';
    console.error('[opn/intent] charge create failed:', e);
    await supabase
      .from('payment_transactions')
      .update({ status: 'failed', error_message: msg })
      .eq('id', txnRow.id);
    return NextResponse.json(
      { status: 'failed', failure_reason: 'unknown', error: 'Payment gateway is not reachable. Please try again.' },
      { status: 502 }
    );
  }

  await supabase
    .from('payment_transactions')
    .update({
      gateway_charge_id: charge.id,
      is_3ds: charge.authorize_uri !== null,
      raw_create_response: charge as unknown as Record<string, unknown>,
    })
    .eq('id', txnRow.id);

  await supabase
    .from('club_rentals')
    .update({
      payment_status: 'pending',
      payment_transaction_id: txnRow.id,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .eq('id', rental.id);

  if (charge.authorize_uri) {
    return NextResponse.json({
      status: 'requires_3ds',
      authorize_uri: charge.authorize_uri,
    });
  }
  if (isChargeSuccessful(charge)) {
    return NextResponse.json({ status: 'success', ref: rental.rental_code });
  }
  if (charge.status === 'failed') {
    return NextResponse.json({
      status: 'failed',
      failure_reason: classifyFailure(charge.failure_code),
    });
  }

  return NextResponse.json({ status: 'success', ref: rental.rental_code });
}
