import 'server-only';
import { shopeepayConfig } from './config';
import { signPayload as signWithSecret, verifyPayload } from './signature';
import type {
  CheckTransactionRequest,
  CheckTransactionResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateRefundRequest,
  CreateRefundResponse,
} from './types';
import { TRANSACTION_TYPE_CHECKOUT } from './types';

/**
 * ShopeePay CwS client — direct REST, no SDK.
 *
 * All requests carry an HMAC-SHA256-Base64 signature over the raw
 * request body in the `X-Airpay-Req-H` header. Server-side only.
 *
 * The pure HMAC math lives in `signature.ts` (no env deps) so unit
 * tests against ShopeePay's worked example can run without stubbing.
 */

const HMAC_HEADER = 'X-Airpay-Req-H';
const CLIENT_HEADER = 'X-Airpay-ClientId';

/** Sign with the configured merchant secret. */
export function signPayload(rawBody: string): string {
  return signWithSecret(rawBody, shopeepayConfig.secretKey);
}

/** Verify an inbound webhook signature with the configured merchant secret. */
export function verifySignature(rawBody: string, headerValue: string | null | undefined): boolean {
  return verifyPayload(rawBody, headerValue, shopeepayConfig.secretKey);
}

interface PostOptions {
  /** Override default 10s timeout. */
  timeoutMs?: number;
}

async function postSigned<TResponse>(
  path: string,
  body: object,
  opts: PostOptions = {}
): Promise<TResponse> {
  // JSON.stringify is intentional — sign exactly the bytes we send.
  // Any reformatting between sign and send breaks the signature.
  const rawBody = JSON.stringify(body);
  const signature = signPayload(rawBody);

  const url = `${shopeepayConfig.baseUrl}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [CLIENT_HEADER]: shopeepayConfig.clientId,
        [HMAC_HEADER]: signature,
      },
      body: rawBody,
      signal: controller.signal,
      // Force fresh — no Vercel data cache for payment ops.
      cache: 'no-store',
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        `ShopeePay ${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
      );
    }

    if (!res.ok) {
      throw new Error(`ShopeePay ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    return parsed as TResponse;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a Checkout-with-ShopeePay order. Returns the redirect URL
 * we send the customer to.
 */
export async function createOrder(
  input: Omit<CreateOrderRequest, 'merchant_ext_id' | 'store_ext_id'>
): Promise<CreateOrderResponse> {
  const body: CreateOrderRequest = {
    ...input,
    merchant_ext_id: shopeepayConfig.merchantExtId,
    store_ext_id: shopeepayConfig.storeExtId,
  };
  return postSigned<CreateOrderResponse>('/v3/merchant-host/order/create', body);
}

/**
 * Poll a transaction's terminal state. Used as a fallback when the
 * webhook is delayed or when the customer lands on /payment/result
 * before the webhook arrives.
 */
export async function checkTransaction(
  input: Omit<
    CheckTransactionRequest,
    'merchant_ext_id' | 'store_ext_id' | 'transaction_type'
  >
): Promise<CheckTransactionResponse> {
  const body: CheckTransactionRequest = {
    ...input,
    transaction_type: TRANSACTION_TYPE_CHECKOUT,
    merchant_ext_id: shopeepayConfig.merchantExtId,
    store_ext_id: shopeepayConfig.storeExtId,
  };
  return postSigned<CheckTransactionResponse>('/v3/merchant-host/transaction/check', body);
}

/**
 * Issue a refund against a previously-successful payment. Called by
 * the back-office (lengolf-forms) refund route via our own
 * /api/payments/shopeepay/refund endpoint.
 *
 * Refund-stack caveat — ShopeePay support (pearpearpearpearpear, 2026-05-25)
 * confirmed:
 *  - Path is `/v3/merchant-host/transaction/refund/create-new`, NOT
 *    `/v3/merchant-host/refund/create` (the latter returns nginx 404).
 *  - Field for the parent payment's reference is `reference_id` (matches
 *    the transaction/check naming), NOT `payment_reference_id`.
 *  - Refund-side webhook is NOT yet implemented on their end (separate
 *    confirmation 2026-05-24). So this route's API response is the
 *    only signal we get back — we write our DB synchronously based on
 *    errcode==0 and don't expect a follow-up notify callback.
 *
 * Idempotency: the caller MUST insert the payment_refunds row
 * (with a unique refund_reference_id and a stable request_id) BEFORE
 * calling this. A network failure mid-call can then be reconciled
 * by retrying with the same refund_reference_id.
 */
export async function createRefund(
  input: Omit<CreateRefundRequest, 'merchant_ext_id' | 'store_ext_id' | 'currency'>
): Promise<CreateRefundResponse> {
  const body: CreateRefundRequest = {
    ...input,
    merchant_ext_id: shopeepayConfig.merchantExtId,
    store_ext_id: shopeepayConfig.storeExtId,
    currency: 'THB',
  };
  return postSigned<CreateRefundResponse>(
    '/v3/merchant-host/transaction/refund/create-new',
    body
  );
}
