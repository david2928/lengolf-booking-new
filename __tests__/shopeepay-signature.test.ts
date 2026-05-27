/**
 * Verify the HMAC signature implementation against ShopeePay's
 * "Get Started" worked example. This is the highest-risk piece of
 * the integration — every API call hinges on it. If this test ever
 * regresses, every payment fails.
 *
 * Worked example values are copied verbatim from
 * https://product.shopeepay.com/integration/get-started/.
 *
 * The test imports from lib/shopeepay/signature.ts (a pure module
 * with no env deps), so it runs without stubbing SHOPEEPAY_* vars.
 */

import { signPayload, verifyPayload } from '@/lib/shopeepay/signature';
import { extractReferenceId } from '@/lib/shopeepay/types';

describe('ShopeePay signPayload — worked example', () => {
  const SECRET = 'pz148x0gXyPCLHxnlhEydNLg55jni91i';
  const BODY =
    '{"request_id": "","store_ext_id": "externalstore","merchant_ext_id": "externalmerchant","amount": 1000,"terminal_id": "terminal","convenience_fee_percentage": 0,"convenience_fee_fixed": 0,"convenience_fee_indicator": "","additional_info": "","currency": "IDR","qr_validity_period": 1000,"payment_reference_id": "testreference"}';
  const EXPECTED = 'X1UyvyMBhnR4h3D0N0NSLf8a9XgiQ/qwax6Gd6c5HUw=';

  it('matches ShopeePay worked-example output', () => {
    expect(signPayload(BODY, SECRET)).toBe(EXPECTED);
  });

  it('is deterministic for the same input', () => {
    expect(signPayload(BODY, SECRET)).toBe(signPayload(BODY, SECRET));
  });

  it('produces different output for different secret', () => {
    expect(signPayload(BODY, SECRET)).not.toBe(signPayload(BODY, 'different-secret'));
  });

  it('produces different output when body changes by one character', () => {
    expect(signPayload(BODY, SECRET)).not.toBe(signPayload(BODY + ' ', SECRET));
  });
});

describe('ShopeePay verifyPayload', () => {
  const SECRET = 'test-secret-for-verify';
  const BODY = '{"foo":"bar","amount":15000}';

  it('accepts a signature it produced itself', () => {
    const sig = signPayload(BODY, SECRET);
    expect(verifyPayload(BODY, sig, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = signPayload(BODY, SECRET);
    expect(verifyPayload(BODY + 'x', sig, SECRET)).toBe(false);
  });

  it('rejects a signature signed with a different secret', () => {
    const sig = signPayload(BODY, 'attacker-key');
    expect(verifyPayload(BODY, sig, SECRET)).toBe(false);
  });

  it('rejects a malformed signature value', () => {
    expect(verifyPayload(BODY, 'not-a-valid-base64-signature', SECRET)).toBe(false);
  });

  it('rejects null / undefined / empty header', () => {
    expect(verifyPayload(BODY, null, SECRET)).toBe(false);
    expect(verifyPayload(BODY, undefined, SECRET)).toBe(false);
    expect(verifyPayload(BODY, '', SECRET)).toBe(false);
  });
});

/**
 * Regression coverage for the UAT 2026-05-15 failure: ShopeePay sent a
 * real payment-success webhook with the merchant reference under the
 * field name `reference_id`, but our webhook handler was destructuring
 * `payment_reference_id` and returned 400 `Missing payment_reference_id`.
 * The handler now uses extractReferenceId(), which accepts either wire
 * name. Keep this test in place so a future "clean up the type" PR
 * can't silently regress.
 */
describe('ShopeePay extractReferenceId — UAT 2026-05-15 payload', () => {
  it('reads reference_id from the actual UAT notify payload', () => {
    // Verbatim payload that ShopeePay logged on 2026-05-15.
    const uatPayload = {
      amount: 120000,
      transaction_sn: '160044308330281009',
      payment_method: 16 as unknown as string, // wire-typed as number; widened in types.ts
      user_id_hash: '4aca8ec7-ad81-4518-a5af-8fd015631e28',
      merchant_ext_id: 'lngolf',
      store_ext_id: 'lngolf',
      reference_id: 'LENGOLF-CR-20260515-0FC6-mp6l29iy',
      transaction_type: 13,
      transaction_status: 3,
      payment_channel: 2,
    };
    expect(extractReferenceId(uatPayload)).toBe('LENGOLF-CR-20260515-0FC6-mp6l29iy');
  });

  it('falls back to payment_reference_id when reference_id is absent', () => {
    // Hypothetical: if ShopeePay normalizes the field later, we keep working.
    expect(
      extractReferenceId({ payment_reference_id: 'LENGOLF-CR-XYZ' })
    ).toBe('LENGOLF-CR-XYZ');
  });

  it('prefers reference_id when both are present', () => {
    expect(
      extractReferenceId({
        reference_id: 'wire-value',
        payment_reference_id: 'fallback-value',
      })
    ).toBe('wire-value');
  });

  it('returns undefined when neither is present', () => {
    expect(extractReferenceId({})).toBeUndefined();
  });

  it('returns undefined for empty-string reference_id', () => {
    // Empty strings are normalized to undefined so callers using
    // `if (referenceId === undefined)` and `if (!referenceId)` behave
    // identically. Without this, a future caller doing strict
    // undefined-check would silently miss the empty case.
    expect(extractReferenceId({ reference_id: '' })).toBeUndefined();
  });

  it('returns undefined for empty-string payment_reference_id fallback', () => {
    // Same normalization applies when reference_id is absent and
    // payment_reference_id is present but empty.
    expect(extractReferenceId({ payment_reference_id: '' })).toBeUndefined();
  });
});
