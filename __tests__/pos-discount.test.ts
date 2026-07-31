/**
 * Tests for the POS discount instruction appended to the staff LINE note.
 *
 * The note is what turns `promotions.pos_discount_id` from a column into an
 * operational fact: staff read it and select that discount at the till. So the
 * two things pinned here are the exact wording, and that a missing pairing
 * degrades to the label alone rather than to a uuid nobody can act on.
 */
import {
  NO_POS_DISCOUNT_INSTRUCTION,
  formatPosDiscountInstruction,
  withNoPosDiscountInstruction,
  withPosDiscountInstruction,
} from '@/lib/pos-discount';

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

/**
 * The counterpart instruction, for a booking the quote did NOT discount.
 *
 * The paired POS rows are percentage / 100.00 / item. On a booking of 2 hours
 * or more the item is the second hour and zeroing it is correct; on a 1-hour
 * booking the item is the whole booking. The offer can still WIN the flow's
 * selection at 1 hour (it contributes advice, worth ฿0), so the note names it —
 * and a named offer with no instruction beside it reads as "apply the usual
 * discount". One hour is the default duration on the ladder.
 */
describe('the advice-only instruction', () => {
  test('tells staff not to discount, in the same brackets as its counterpart', () => {
    expect(withNoPosDiscountInstruction('Weekday Buy 1 Get 1 Free'))
      .toBe('Weekday Buy 1 Get 1 Free [do not apply a POS discount to this booking]');
  });

  test('is an imperative, not an absence', () => {
    // Silence was the alternative and is the failure mode: it leaves a staff
    // member to infer the action from the offer's name.
    expect(NO_POS_DISCOUNT_INSTRUCTION).toBe('do not apply a POS discount to this booking');
    expect(withNoPosDiscountInstruction('X')).not.toBe('X');
  });

  test('sits beside the free-hour expiry rather than replacing it', () => {
    // The new-customer B1G1's advice-only label already says what IS owed. This
    // adds what is NOT to be done now; the two are different facts.
    const label = 'Buy 1 Get 1 Free (1 free hr to redeem within 7 days, expires 1 Aug)';
    expect(withNoPosDiscountInstruction(label))
      .toBe(`${label} [do not apply a POS discount to this booking]`);
  });

  test('never names a POS discount, however the pairing is configured', () => {
    // It takes no title argument on purpose: there is no pairing state in which
    // an undiscounted booking should carry "apply POS discount ...".
    expect(withNoPosDiscountInstruction('Weekday Buy 1 Get 1 Free'))
      .not.toContain('apply POS discount "');
  });
});
