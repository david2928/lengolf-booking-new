import 'server-only';
import { opnConfig } from '@/lib/opn/config';
import type { OpnCharge, OpnRefund } from '@/lib/opn/types';

/**
 * Thin REST client for the Opn (Omise) API.
 *
 * Deliberately NOT the `omise` npm SDK: the SDK has no way to send the
 * `Idempotency-Key` header, which is the only server-side protection
 * against a double-submitted token creating two captured charges. The
 * REST surface we touch is four endpoints with stable, documented
 * shapes (see lib/opn/types.ts), and form-encoding matches every
 * worked example in Opn's docs.
 *
 * Error contract: Opn returns HTTP 4xx with
 * `{ object: 'error', code, message }` for API-level failures.
 * DECLINED CARDS ARE NOT ERRORS — charge creation returns 200 with a
 * charge object whose status is 'failed' + failure_code set. Callers
 * branch on the charge object, and only catch OpnApiError for
 * gateway-unreachable / auth-level problems.
 */

const OPN_API_BASE = 'https://api.omise.co';

export class OpnApiError extends Error {
  readonly httpStatus: number;
  readonly code: string;

  constructor(httpStatus: number, code: string, message: string) {
    super(`Opn API error ${httpStatus} (${code}): ${message}`);
    this.name = 'OpnApiError';
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

/** Charge/refund ids go into URL paths — never interpolate unvalidated. */
function assertSafeId(id: string, label: string): void {
  if (!/^[A-Za-z0-9_]+$/.test(id)) {
    throw new OpnApiError(400, 'invalid_id', `${label} has an unexpected shape`);
  }
}

async function opnFetch<T>(
  path: string,
  opts: {
    method: 'GET' | 'POST';
    form?: Record<string, string>;
    idempotencyKey?: string;
  }
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${opnConfig.secretKey}:`).toString('base64')}`,
    'Omise-Version': opnConfig.apiVersion,
  };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`${OPN_API_BASE}${path}`, {
    method: opts.method,
    headers,
    // URLSearchParams sets Content-Type: application/x-www-form-urlencoded
    // automatically — the encoding all of Opn's documented examples use.
    body: opts.form ? new URLSearchParams(opts.form) : undefined,
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (json?.object === 'error') {
    throw new OpnApiError(
      res.status,
      String(json.code ?? 'unknown'),
      String(json.message ?? 'no message')
    );
  }
  if (!res.ok) {
    throw new OpnApiError(res.status, 'http_error', `unexpected HTTP ${res.status}`);
  }
  return json as T;
}

export interface CreateChargeInput {
  amountSatang: number;
  currency: 'thb';
  cardToken: string; // tokn_*
  returnUri: string;
  metadata: Record<string, string>;
  /** Sent as the Idempotency-Key header — same key returns the same charge. */
  idempotencyKey: string;
}

export async function createCharge(input: CreateChargeInput): Promise<OpnCharge> {
  const form: Record<string, string> = {
    amount: String(input.amountSatang),
    currency: input.currency,
    card: input.cardToken,
    return_uri: input.returnUri,
  };
  for (const [key, value] of Object.entries(input.metadata)) {
    form[`metadata[${key}]`] = value;
  }
  return opnFetch<OpnCharge>('/charges', {
    method: 'POST',
    form,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function retrieveCharge(chargeId: string): Promise<OpnCharge> {
  assertSafeId(chargeId, 'chargeId');
  return opnFetch<OpnCharge>(`/charges/${chargeId}`, { method: 'GET' });
}

export async function createRefund(
  chargeId: string,
  amountSatang: number,
  idempotencyKey?: string
): Promise<OpnRefund> {
  assertSafeId(chargeId, 'chargeId');
  return opnFetch<OpnRefund>(`/charges/${chargeId}/refunds`, {
    method: 'POST',
    form: { amount: String(amountSatang) },
    idempotencyKey,
  });
}

export async function retrieveRefund(chargeId: string, refundId: string): Promise<OpnRefund> {
  assertSafeId(chargeId, 'chargeId');
  assertSafeId(refundId, 'refundId');
  return opnFetch<OpnRefund>(`/charges/${chargeId}/refunds/${refundId}`, { method: 'GET' });
}
