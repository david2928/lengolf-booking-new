/**
 * The predicate that was missing from the main booking flow.
 *
 * Booking BK260803FKLR (2026-08-03) stored the email `r` and reached nodemailer
 * with it. Every gate it passed — the identity card, `validateForm`, and the
 * create route — tested presence alone, while the phone field beside them was
 * fully validated. These tests pin the bar: usable as an SMTP recipient, and
 * nothing stricter.
 */
import { isValidEmail, normalizeEmail } from '@/lib/email-format';

describe('isValidEmail', () => {
  test.each([
    ['a plain address', 'rowan@len.golf'],
    ['subdomains', 'rowan@mail.corp.len.golf'],
    ['a plus tag', 'rowan+bookings@len.golf'],
    ['dots in the local part', 'rowan.mckenzie@len.golf'],
    ['surrounding whitespace, which is trimmed', '  rowan@len.golf  '],
    ['a long TLD', 'rowan@len.technology'],
    // The bar is deliberately loose. Anything shaped like an address is passed
    // through to SMTP to judge — the alternative, a stricter pattern, reliably
    // rejects real addresses, and this flow has no confirmation link to appeal to.
    ['a non-ASCII local part', 'ローワン@len.golf'],
  ])('accepts %s', (_label, value) => {
    expect(isValidEmail(value)).toBe(true);
  });

  test.each([
    ['the single character that caused this', 'r'],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['no @', 'rowan.len.golf'],
    ['no domain', 'rowan@'],
    ['no local part', '@len.golf'],
    ['no dot in the domain', 'rowan@localhost'],
    ['two @', 'rowan@@len.golf'],
    ['an internal space', 'rowan mckenzie@len.golf'],
    ['a space before the domain', 'rowan@ len.golf'],
  ])('rejects %s', (_label, value) => {
    expect(isValidEmail(value)).toBe(false);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s without throwing', (_label, value) => {
    expect(isValidEmail(value)).toBe(false);
  });

  test('a non-string never reaches the regex', () => {
    // Callers hand this untrusted JSON bodies, where `email` can be any type.
    expect(isValidEmail(42 as unknown as string)).toBe(false);
    expect(isValidEmail({} as unknown as string)).toBe(false);
  });
});

describe('normalizeEmail', () => {
  test('returns the trimmed address when it is usable', () => {
    expect(normalizeEmail('  rowan@len.golf ')).toBe('rowan@len.golf');
  });

  test.each([
    ['r'],
    [''],
    ['   '],
    [null],
    [undefined],
  ])('collapses unusable input (%s) to null', (value) => {
    expect(normalizeEmail(value as string | null | undefined)).toBeNull();
  });

  test('composes into a fallback chain without re-testing either branch', () => {
    // The shape the create route depends on: submitted address first, the
    // authenticated profile's address second, null when neither is usable.
    const resolve = (submitted: string | null, onFile: string | null) =>
      normalizeEmail(submitted) ?? normalizeEmail(onFile);

    expect(resolve('rowan@len.golf', 'old@len.golf')).toBe('rowan@len.golf');
    expect(resolve('r', 'radicalman@netvigator.com')).toBe('radicalman@netvigator.com');
    expect(resolve('r', 'also-bad')).toBeNull();
    expect(resolve(null, null)).toBeNull();
  });

  test('the booking row never gets null, because the column is NOT NULL', () => {
    // `public.bookings.email` is NOT NULL with no default, so writing the
    // resolution result straight in raises 23502 and FAILS THE BOOKING for
    // anyone the fallback cannot help — which is most LINE and Facebook
    // profiles, since they carry no email at all. Losing a confirmed slot over
    // a typo is strictly worse than the un-mailed confirmation this whole
    // change exists to fix, so the raw submission is the last resort. It never
    // reaches SMTP: `sendBookingConfirmationEmail` refuses it separately.
    const stored = (submitted: unknown, onFile: string | null) =>
      normalizeEmail(onFile) ?? (typeof submitted === 'string' ? submitted.trim() : '');

    expect(stored('rowan@len.golf', null)).toBe('rowan@len.golf');
    expect(stored('r', 'radicalman@netvigator.com')).toBe('radicalman@netvigator.com');
    expect(stored('r', null)).toBe('r');
    expect(stored('', null)).toBe('');
    expect(stored(undefined, null)).toBe('');
    expect(stored(null, null)).toBe('');

    for (const submitted of ['rowan@len.golf', 'r', '', '  ', null, undefined, 42]) {
      for (const onFile of ['radicalman@netvigator.com', 'bad', null]) {
        expect(typeof stored(submitted, onFile)).toBe('string');
      }
    }
  });

  test('agrees with isValidEmail on every input', () => {
    for (const value of ['a@b.com', 'r', '', '   ', 'a@b', null, undefined]) {
      expect(normalizeEmail(value) !== null).toBe(isValidEmail(value));
    }
  });
});
