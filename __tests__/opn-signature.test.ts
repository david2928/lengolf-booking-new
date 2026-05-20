/**
 * Pure HMAC-SHA256 signature tests for Opn webhook verification.
 * Imports lib/opn/signature.ts (no env deps) — runs without stubs.
 *
 * The "regression" tests use a precomputed expected signature so a
 * silent algorithm regression (e.g. switching to base64 or to a
 * different hash) fails loudly. The expected value was computed
 * once with Node's crypto module against the documented Opn scheme:
 *   HMAC-SHA256(`${timestamp}.${rawBody}`, secret), hex-encoded.
 */
import { signPayload, verifyPayload } from '@/lib/opn/signature';

const SECRET = 'whsec_test_fixture_32_chars_abcdef';
const TS = '1700000000';
const BODY = '{"id":"chrg_test_5fixture","object":"charge","status":"successful"}';
const EXPECTED_SIG = 'ac7f6ea5f6fe499fac2c2d171f1fdd05c90f36531369851483fe737f63e1747f';

describe('Opn signPayload — algorithm regression', () => {
  it('matches the precomputed HMAC-SHA256 hex', () => {
    expect(signPayload(TS, BODY, SECRET)).toBe(EXPECTED_SIG);
  });

  it('is deterministic', () => {
    expect(signPayload(TS, BODY, SECRET)).toBe(signPayload(TS, BODY, SECRET));
  });

  it('differs when secret changes', () => {
    expect(signPayload(TS, BODY, SECRET)).not.toBe(signPayload(TS, BODY, 'other-secret'));
  });

  it('differs when timestamp changes', () => {
    expect(signPayload(TS, BODY, SECRET)).not.toBe(signPayload(TS + '1', BODY, SECRET));
  });

  it('differs when body changes by one char', () => {
    expect(signPayload(TS, BODY, SECRET)).not.toBe(signPayload(TS, BODY + ' ', SECRET));
  });
});

describe('Opn verifyPayload', () => {
  it('roundtrip: sign then verify with same secret returns true', () => {
    const sig = signPayload(TS, BODY, SECRET);
    expect(verifyPayload(BODY, sig, TS, [SECRET])).toBe(true);
  });

  it('rejects when body was tampered', () => {
    const sig = signPayload(TS, BODY, SECRET);
    expect(verifyPayload(BODY + 'x', sig, TS, [SECRET])).toBe(false);
  });

  it('rejects when timestamp was tampered', () => {
    const sig = signPayload(TS, BODY, SECRET);
    expect(verifyPayload(BODY, sig, '1700000001', [SECRET])).toBe(false);
  });

  it('rejects when secret is wrong', () => {
    const sig = signPayload(TS, BODY, 'attacker-key');
    expect(verifyPayload(BODY, sig, TS, [SECRET])).toBe(false);
  });

  it('rejects null / undefined / empty headers', () => {
    expect(verifyPayload(BODY, null, TS, [SECRET])).toBe(false);
    expect(verifyPayload(BODY, undefined, TS, [SECRET])).toBe(false);
    expect(verifyPayload(BODY, '', TS, [SECRET])).toBe(false);
    expect(verifyPayload(BODY, 'somesig', null, [SECRET])).toBe(false);
  });

  it('rejects when no secrets are provided', () => {
    const sig = signPayload(TS, BODY, SECRET);
    expect(verifyPayload(BODY, sig, TS, [])).toBe(false);
  });

  it('rejects malformed (non-hex) signature', () => {
    expect(verifyPayload(BODY, 'not_a_hex_sig!!', TS, [SECRET])).toBe(false);
  });
});

describe('Opn verifyPayload — dual-secret rotation', () => {
  const OLD = 'whsec_old_secret_32_chars_abcdef_ghi';
  const NEW = 'whsec_new_secret_32_chars_abcdef_ghi';

  it('accepts an old-secret signature when both secrets are active', () => {
    const oldSig = signPayload(TS, BODY, OLD);
    expect(verifyPayload(BODY, oldSig, TS, [NEW, OLD])).toBe(true);
  });

  it('accepts a new-secret signature when both secrets are active', () => {
    const newSig = signPayload(TS, BODY, NEW);
    expect(verifyPayload(BODY, newSig, TS, [NEW, OLD])).toBe(true);
  });

  it('accepts a comma-separated header with both signatures', () => {
    const oldSig = signPayload(TS, BODY, OLD);
    const newSig = signPayload(TS, BODY, NEW);
    expect(verifyPayload(BODY, `${oldSig},${newSig}`, TS, [NEW, OLD])).toBe(true);
    expect(verifyPayload(BODY, `${newSig},${oldSig}`, TS, [NEW, OLD])).toBe(true);
  });

  it('rejects old signature after old secret is retired (post-rotation)', () => {
    const oldSig = signPayload(TS, BODY, OLD);
    expect(verifyPayload(BODY, oldSig, TS, [NEW])).toBe(false);
  });

  it('tolerates whitespace around comma-separated signatures', () => {
    const oldSig = signPayload(TS, BODY, OLD);
    const newSig = signPayload(TS, BODY, NEW);
    expect(verifyPayload(BODY, ` ${oldSig} , ${newSig} `, TS, [NEW, OLD])).toBe(true);
  });
});
