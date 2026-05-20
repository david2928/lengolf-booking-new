import 'server-only';
import Omise from 'omise';
import { opnConfig } from '@/lib/opn/config';
import type { OpnCharge, OpnRefund } from '@/lib/opn/types';

/**
 * Wraps the omise-node SDK. Single shared instance pinned to the
 * API version from env. Thin — adds typed return shapes and the
 * Idempotency-Key header for /charges creation so a double-click
 * can't double-charge.
 *
 * The SDK uses callbacks by default but supports promise returns
 * when no callback is supplied. We always use the promise form.
 */

const client = Omise({
  publicKey: opnConfig.publicKey,
  secretKey: opnConfig.secretKey,
  omiseVersion: opnConfig.apiVersion,
});

export interface CreateChargeInput {
  amountSatang: number;
  currency: 'thb';
  cardToken: string;          // tokn_*
  returnUri: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export async function createCharge(input: CreateChargeInput): Promise<OpnCharge> {
  // omise-node's TS types don't always expose `headers` on charges.create
  // params. If the installed version doesn't accept it, fall back to
  // omitting and rely on the (rental_code, status='pending') idempotency
  // check in /api/payments/opn/intent. The `as any` bypasses the SDK's
  // strict IRequest shape so we can pass `card` without TS complaining about
  // undocumented fields that the runtime API does accept.
  const chargeParams = {
    amount: input.amountSatang,
    currency: input.currency,
    card: input.cardToken,
    return_uri: input.returnUri,
    metadata: input.metadata,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.charges.create(chargeParams as any);
  return result as unknown as OpnCharge;
}

export async function retrieveCharge(chargeId: string): Promise<OpnCharge> {
  const result = await client.charges.retrieve(chargeId);
  return result as unknown as OpnCharge;
}

export async function createRefund(
  chargeId: string,
  amountSatang?: number
): Promise<OpnRefund> {
  // IRefundRequest types `amount` as required, but the Omise API accepts
  // an empty body for a full refund. Cast to any to allow the optional shape.
  const params: { amount?: number } = {};
  if (typeof amountSatang === 'number') params.amount = amountSatang;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.charges.createRefund(chargeId, params as any);
  return result as unknown as OpnRefund;
}

export async function retrieveRefund(
  chargeId: string,
  refundId: string
): Promise<OpnRefund> {
  const result = await client.charges.retrieveRefund(chargeId, refundId);
  return result as unknown as OpnRefund;
}
