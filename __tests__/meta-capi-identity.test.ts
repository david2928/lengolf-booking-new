import {
  normalizeEmail,
  normalizePhoneE164,
  phoneCountry,
  splitName,
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

  it('returns null for an unparseable number', () => {
    expect(phoneCountry('not a phone')).toBeNull();
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
});
