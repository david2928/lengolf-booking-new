import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyPayloadDetailed } from '@/lib/opn/signature';
import { webhookSecrets } from '@/lib/opn/config';
import { handleRefundNotify } from '@/lib/opn/handleRefundNotify';
import { processChargeResult } from '@/lib/opn/processChargeResult';
import {
  isChargeTerminal,
  type OpnCharge,
  type OpnRefund,
  type OpnWebhookEvent,
} from '@/lib/opn/types';

/**
 * POST /api/webhooks/opn
 *
 * Receives Opn (Omise) webhook events. Verifies the HMAC signature on
 * the raw body, rejects stale timestamps, and processes:
 *   - charge.complete — terminal result of a pending (3DS/offsite) charge
 *   - charge.create   — terminal result of a synchronously-authorized
 *                       (non-3DS) charge. Omise only fires charge.complete
 *                       for charges that went through a pending state, so
 *                       non-3DS payments would have NO webhook coverage if
 *                       we ack'd this unprocessed (browser dies post-charge
 *                       → cron cancels a PAID rental at expires_at).
 *   - refund.create   — dashboard- or API-initiated refunds
 *
 * All DB writes + side-effects live in lib/opn/processChargeResult —
 * the shared single writer for the webhook, the intent route's sync
 * results, and the polling fallback.
 */

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
  // Read the body as text BEFORE parsing — the signature is computed
  // over the exact bytes Opn sent.
  const rawBody = await request.text();
  const headerSig = request.headers.get('omise-signature');
  const headerTs = request.headers.get('omise-signature-timestamp');

  const verdict = verifyPayloadDetailed(rawBody, headerSig, headerTs, webhookSecrets());
  if (!verdict.valid) {
    console.warn('[opn/webhook] signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Settle the raw-vs-base64 key-encoding question from logs on the
  // first real delivery (Opn docs say base64-decode the secret; we
  // verify against both conventions).
  console.log(`[opn/webhook] signature ok (key convention: ${verdict.keyKind})`);

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
    case 'charge.create': {
      const charge = event.data as OpnCharge;
      // charge.create fires for every charge, including 3DS charges that
      // are still pending (the customer is at the issuer page). Only
      // terminal charges carry a result worth recording — pending ones
      // resolve via charge.complete or the polling fallback.
      if (!isChargeTerminal(charge)) {
        return NextResponse.json(ACK_OK);
      }
      const outcome = await processChargeResult(supabase, charge, { baseUrl: getBaseUrl() });
      switch (outcome.kind) {
        case 'db_error':
          // Non-2xx so Opn retries; the consistency fallthrough repairs
          // half-committed state on the next delivery.
          return NextResponse.json({ error: 'Internal error' }, { status: 500 });
        case 'amount_mismatch':
          return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
        default:
          return NextResponse.json(ACK_OK);
      }
    }
    case 'refund.create':
      return handleRefundNotify(supabase, event.data as OpnRefund, { baseUrl: getBaseUrl() });
    default:
      console.log('[opn/webhook] unhandled event key:', event.key);
      return NextResponse.json(ACK_OK);
  }
}
