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
