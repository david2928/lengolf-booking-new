/**
 * Tests for the POS discount instruction appended to the staff LINE note.
 *
 * The note is what turns `promotions.pos_discount_id` from a column into an
 * operational fact: staff read it and select that discount at the till. So the
 * two things pinned here are the exact wording, and that a missing pairing
 * degrades to the label alone rather than to a uuid nobody can act on.
 */
import { formatPosDiscountInstruction, withPosDiscountInstruction } from '@/lib/pos-discount';

describe('the staff-facing POS discount instruction', () => {
  test('names the discount to select, quoted', () => {
    expect(formatPosDiscountInstruction('Buy 1 Get 1 Free — Weekday'))
      .toBe('apply POS discount "Buy 1 Get 1 Free — Weekday"');
  });

  test('appends to the promo label in brackets', () => {
    expect(withPosDiscountInstruction('Weekday Buy 1 Get 1 Free', 'Buy 1 Get 1 Free — Weekday'))
      .toBe('Weekday Buy 1 Get 1 Free [apply POS discount "Buy 1 Get 1 Free — Weekday"]');
  });

  test('does not disturb the free-hour expiry text it sits beside', () => {
    // The advice-only B1G1 label uses parentheses for the expiry; the POS
    // instruction uses brackets so the two read as separate facts.
    const label = 'Buy 1 Get 1 Free (1 free hr to redeem within 7 days, expires 1 Aug)';
    expect(withPosDiscountInstruction(label, 'Buy 1 Get 1'))
      .toBe(`${label} [apply POS discount "Buy 1 Get 1"]`);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace', '   '],
  ])('an unresolved pairing (%s) leaves the label exactly as it was', (_name, title) => {
    // NULL pos_discount_id is the state of every pre-existing promotion, so
    // this is the no-change path for the new-customer B1G1 and must stay byte
    // identical to what staff read today.
    expect(withPosDiscountInstruction('Buy 1 Get 1 Free', title)).toBe('Buy 1 Get 1 Free');
  });
});
