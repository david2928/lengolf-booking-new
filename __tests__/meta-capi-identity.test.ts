import {
  normalizeEmail,
  normalizePhoneE164,
  phoneCountry,
  splitName,
  hashIdentifier,
  buildUserData,
} from '@/lib/meta/identity';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  John.Doe@Example.COM ')).toBe('john.doe@example.com');
  });

  it.each([
    ['blank', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['no at sign', 'notanemail'],
  ])('rejects %s', (_label, input) => {
    expect(normalizeEmail(input as string | null)).toBeNull();
  });

  // The placeholder: one shared address on 383 of 411 staff bookings.
  it.each([
    'info@len.golf',
    'INFO@LEN.GOLF',
    '  booking@len.golf  ',
    'anything@len.golf',
  ])('rejects the @len.golf placeholder: %s', (input) => {
    expect(normalizeEmail(input)).toBeNull();
  });

  it('does not reject a lookalike domain that merely contains len.golf', () => {
    expect(normalizeEmail('someone@notlen.golf.com')).toBe('someone@notlen.golf.com');
  });
});

describe('normalizePhoneE164', () => {
  it.each([
    ['Thai local 10-digit', '0812345678', '+66812345678'],
    ['Thai with country code, no plus', '66812345678', '+66812345678'],
    ['Thai bare 9-digit, missing leading zero', '812345678', '+66812345678'],
    ['Thai with separators', '081-234-5678', '+66812345678'],
    ['Thai 09 prefix', '0991112222', '+66991112222'],
    ['Singapore tourist', '+6591234567', '+6591234567'],
    ['German tourist', '+4917612345678', '+4917612345678'],
    ['UK tourist', '+447400123456', '+447400123456'],
    ['Indonesian tourist', '+62812345678', '+62812345678'],
  ])('normalises %s', (_label, input, expected) => {
    expect(normalizePhoneE164(input)).toBe(expected);
  });

  it.each([
    ['blank', ''],
    ['whitespace', '   '],
    ['null', null],
    ['garbage', 'not a phone'],
    ['too short', '123'],
  ])('rejects %s', (_label, input) => {
    expect(normalizePhoneE164(input as string | null)).toBeNull();
  });
});

describe('phoneCountry', () => {
  // Meta wants a lowercase ISO-3166-1 alpha-2 country. Deriving it from the
  // parsed number is accurate per customer; hardcoding 'th' would be wrong for
  // every tourist in the book.
  it.each([
    ['Thai local', '0812345678', 'th'],
    ['Singapore', '+6591234567', 'sg'],
    ['Germany', '+4917612345678', 'de'],
  ])('derives %s', (_label, input, expected) => {
    expect(phoneCountry(input)).toBe(expected);
  });

  // Structurally identical to normalizePhoneE164 above — asymmetric coverage
  // between the two is exactly how a regression in one slips through.
  it.each([
    ['blank', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['garbage', 'not a phone'],
    ['too short', '123'],
  ])('rejects %s', (_label, input) => {
    expect(phoneCountry(input as string | null)).toBeNull();
  });
});

describe('splitName', () => {
  it('splits first and last', () => {
    expect(splitName('John Doe')).toEqual({ first: 'john', last: 'doe' });
  });

  it('treats a single token as first name only', () => {
    expect(splitName('Cher')).toEqual({ first: 'cher', last: null });
  });

  it('folds middle names into the last name field', () => {
    expect(splitName('Mary Jane Watson')).toEqual({ first: 'mary', last: 'jane watson' });
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(splitName("  O'Brien,  Sean  ")).toEqual({ first: 'obrien', last: 'sean' });
  });

  it('returns nulls for blank input', () => {
    expect(splitName('  ')).toEqual({ first: null, last: null });
  });

  // Thai tone marks and vowel signs are Unicode category Mn, and Thai has no
  // precomposed forms. Stripping them rewrites the name and hashes to something
  // that matches nobody — the majority of this customer base.
  it.each([
    ['สมชาย ใจดี', { first: 'สมชาย', last: 'ใจดี' }],
    ['นิดา น้ำใส', { first: 'นิดา', last: 'น้ำใส' }],
    ['ธีระพงษ์ วงศ์คำ', { first: 'ธีระพงษ์', last: 'วงศ์คำ' }],
  ])('preserves Thai combining marks in %s', (input, expected) => {
    expect(splitName(input as string)).toEqual(expected);
  });

  it('folds decomposed and precomposed spellings to the same string', () => {
    // Built from escapes on purpose: written as pasted literals these are
    // visually identical, so the test would compare a string to itself.
    const precomposed = 'José'; // single codepoint U+00E9 (e with acute)
    const decomposed = 'José'; // 'e' + combining acute accent U+0301
    expect(precomposed).not.toBe(decomposed);
    expect(splitName(decomposed)).toEqual(splitName(precomposed));
    expect(splitName(precomposed).first).toBe('josé');
  });
});

describe('hashIdentifier', () => {
  // Verified against `node -e "crypto.createHash('sha256')..."`.
  it.each([
    ['test@example.com', '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b'],
    ['+66812345678', '7fc93a279e8accbc8e77df576f2f1806df2b9cbff068711f3de71108184e6bb2'],
    ['john', '96d9632f363564cc3032521409cf22a852f2032eec099ed5967c0d000cec607a'],
    ['doe', '799ef92a11af918e3fb741df42934f3b568ed2d93ac1df74f1b8d41a27932a6f'],
    ['th', '6bde0b830d8bd56dea61c5c1cb648c7ffca6ffce2923ad1db9f29079cac947e0'],
  ])('hashes %s to the documented SHA-256', (input, expected) => {
    expect(hashIdentifier(input)).toBe(expected);
  });
});

describe('buildUserData', () => {
  it('prefers the customer record email over the booking email', () => {
    const result = buildUserData({
      bookingEmail: 'stale@example.com',
      customerEmail: 'test@example.com',
      phone: null,
      name: null,
    });
    expect(result?.userData.em).toEqual([
      '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
    ]);
  });

  // The whole point of the customers join: 139 of 411 staff bookings hide a
  // real address behind the @len.golf placeholder on the booking row.
  it('falls back to the booking email when the customer email is the placeholder', () => {
    const result = buildUserData({
      bookingEmail: 'test@example.com',
      customerEmail: 'info@len.golf',
      phone: null,
      name: null,
    });
    expect(result?.userData.em).toEqual([
      '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
    ]);
  });

  it('hashes the phone in E.164', () => {
    const result = buildUserData({
      bookingEmail: null,
      customerEmail: null,
      phone: '0812345678',
      name: null,
    });
    expect(result?.userData.ph).toEqual([
      '7fc93a279e8accbc8e77df576f2f1806df2b9cbff068711f3de71108184e6bb2',
    ]);
  });

  it('includes hashed first and last name when present', () => {
    const result = buildUserData({
      bookingEmail: 'test@example.com',
      customerEmail: null,
      phone: null,
      name: 'John Doe',
    });
    expect(result?.userData.fn).toEqual([
      '96d9632f363564cc3032521409cf22a852f2032eec099ed5967c0d000cec607a',
    ]);
    expect(result?.userData.ln).toEqual([
      '799ef92a11af918e3fb741df42934f3b568ed2d93ac1df74f1b8d41a27932a6f',
    ]);
  });

  it('derives the country from the phone, not a hardcoded th', () => {
    const thai = buildUserData({
      bookingEmail: null, customerEmail: null, phone: '0812345678', name: null,
    });
    expect(thai?.userData.country).toEqual([
      '6bde0b830d8bd56dea61c5c1cb648c7ffca6ffce2923ad1db9f29079cac947e0',
    ]);

    const german = buildUserData({
      bookingEmail: null, customerEmail: null, phone: '+4917612345678', name: null,
    });
    // Must differ from the Thai hash — a tourist is not in Thailand.
    expect(german?.userData.country).not.toEqual(thai?.userData.country);
  });

  it('omits country when there is no phone to derive it from', () => {
    const result = buildUserData({
      bookingEmail: 'test@example.com', customerEmail: null, phone: null, name: null,
    });
    expect(result?.userData).not.toHaveProperty('country');
  });

  it('reports which identifier kinds were sent, never their values', () => {
    const result = buildUserData({
      bookingEmail: 'test@example.com',
      customerEmail: null,
      phone: '0812345678',
      name: 'John Doe',
    });
    expect(result?.matchKeys.sort()).toEqual(['country', 'em', 'fn', 'ln', 'ph']);
  });

  // Name alone is far too weak to match on and would pollute match-quality
  // metrics, so it is never sufficient on its own.
  it('returns null when neither email nor phone survives', () => {
    expect(
      buildUserData({
        bookingEmail: 'info@len.golf',
        customerEmail: null,
        phone: '',
        name: 'John Doe',
      }),
    ).toBeNull();
  });

  it('omits absent fields rather than sending empty arrays', () => {
    const result = buildUserData({
      bookingEmail: null,
      customerEmail: null,
      phone: '0812345678',
      name: null,
    });
    expect(result?.userData).not.toHaveProperty('em');
    expect(result?.userData).not.toHaveProperty('fn');
  });
});
