import { toE164 } from '@/lib/phone-e164';

/**
 * `react-phone-number-input` and `isValidPhoneNumber` accept E.164 only, so a
 * number arriving in any other shape renders as invalid and the customer
 * retypes something that was already correct.
 *
 * Three sources feed this: the CRM record and `profiles.phone_number` (both
 * stored in local Thai form), and BROWSER AUTOFILL, which supplies whatever is
 * in the customer's contact card. The last one is why the logic was lifted out
 * of the VIP prefill path — autofilled numbers previously went in raw.
 */
describe('toE164', () => {
  it.each([
    ['Thai national format', '0842695447', '+66842695447'],
    ['Thai subscriber, trunk code already stripped', '842695447', '+66842695447'],
    ['country code without the plus', '66842695447', '+66842695447'],
    ['old-style international prefix', '0066842695447', '+66842695447'],
  ])('normalises %s', (_label, input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  // Address books hand back all of these.
  it.each([
    ['spaces', '084 269 5447'],
    ['hyphens', '084-269-5447'],
    ['dots', '084.269.5447'],
    ['bracketed trunk code', '(084) 269 5447'],
    ['mixed', ' 084-269 5447 '],
  ])('strips %s before normalising', (_label, input) => {
    expect(toE164(input)).toBe('+66842695447');
  });

  // A number that names its own country must never be rewritten — doing so
  // would relocate a foreign customer to Thailand.
  it.each([
    ['+66842695447'],
    ['+447911123456'],
    ['+14155552671'],
    ['+8613800138000'],
  ])('leaves %s alone', (input) => {
    expect(toE164(input)).toBe(input);
  });

  it('strips formatting from an already-international number', () => {
    expect(toE164('+44 7911 123456')).toBe('+447911123456');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace only', '   '],
    ['punctuation only', ' -- () '],
  ])('returns undefined for %s', (_label, input) => {
    expect(toE164(input as string | null | undefined)).toBeUndefined();
  });

  // Conservative by design: guessing a country for an ambiguous number is worse
  // than handing it back and letting the phone input's validator decide.
  it.each([
    ['too short', '12345'],
    ['too long for any rule we have', '12345678901234'],
    ['eight digits', '84269544'],
  ])('returns %s unchanged rather than guessing', (_label, input) => {
    expect(toE164(input)).toBe(input);
  });

  // `66` + 9 digits is a Thai number written without the plus. A bare 9-digit
  // number starting 66 is a SUBSCRIBER number and must take the 9-digit rule
  // instead, or it would lose its leading digits.
  it('does not mistake a subscriber number beginning 66 for a country code', () => {
    expect(toE164('661234567')).toBe('+66661234567');
  });
});
