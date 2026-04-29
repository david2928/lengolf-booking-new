import 'server-only';
import { shopeepayConfig } from './config';
import { signPayload as signWithSecret, verifyPayload } from './signature';
import type {
  CheckTransactionRequest,
  CheckTransactionResponse,
  CreateOrderRequest,
  CreateOrderResponse,
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
