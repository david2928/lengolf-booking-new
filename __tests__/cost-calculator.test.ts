/**
 * Tests for the booking cost calculator — bay-rate proration across the
 * 14:00 slot boundary (morning ฿550 → afternoon ฿750 weekday) and the
 * B1G1 club-rental disclosure note.
 *
 * Real incident: BK260715J6RC — a 13:30 1-hour booking previewed at the
 * morning rate (฿550) but the paid hour ran 13:30–14:30, half morning /
 * half afternoon; POS charged the full afternoon rate (฿750).
 */
import { calculateCost, type ApplicablePromotion, type CostCalculationInput } from '@/lib/cost-calculator';

const WEEKDAY = '2026-07-15'; // Wednesday
const WEEKEND = '2026-07-18'; // Saturday

const baseInput: CostCalculationInput = {
  date: WEEKDAY,
  startTime: '13:00',
  duration: 1,
  clubRentalId: 'none',
  hasActivePackage: false,
  isNewCustomer: true,
  applicablePromotions: [],
};

const bogoPromo: ApplicablePromotion = {
  id: 'promo-b1g1',
  promotion_type: 'bogo',
  free_hours: 1,
  applies_to: 'bay_rate',
  conditions: {},
  title_en: 'Buy 1 Get 1 Free',
  title_th: 'ซื้อ 1 แถม 1',
};

function bayItem(input: Partial<CostCalculationInput>) {
  const breakdown = calculateCost({ ...baseInput, ...input });
  const item = breakdown.lineItems.find((i) => i.id === 'bay-rate');
  if (!item) throw new Error('bay-rate line item missing');
  return { breakdown, item };
}

describe('bay rate proration across the 14:00 boundary', () => {
  test('13:30 1h weekday straddles morning/afternoon → ฿650 (0.5×550 + 0.5×750)', () => {
    const { item } = bayItem({ startTime: '13:30', duration: 1 });
    expect(item.amount).toBe(650);
    expect(item.detail).toBe('0.5hr × ฿550 + 0.5hr × ฿750 (Weekday)');
  });

  test('13:00 1h weekday stays fully in the morning slot → ฿550, unchanged format', () => {
    const { item } = bayItem({ startTime: '13:00', duration: 1 });
    expect(item.amount).toBe(550);
    expect(item.detail).toBe('1hr × ฿550/hr (Weekday, Before 14:00)');
  });

  test('12:00 3h weekday spans the boundary → 2×550 + 1×750 = ฿1,850', () => {
    const { item } = bayItem({ startTime: '12:00', duration: 3 });
    expect(item.amount).toBe(1850);
    expect(item.detail).toBe('2hr × ฿550 + 1hr × ฿750 (Weekday)');
  });

  test('14:00 2h weekend is single-rate afternoon → ฿1,900', () => {
    const { item } = bayItem({ date: WEEKEND, startTime: '14:00', duration: 2 });
    expect(item.amount).toBe(1900);
    expect(item.detail).toBe('2hr × ฿950/hr (Weekend, 14:00 - 17:00)');
  });

  test('16:00 2h weekday crossing into evening promo shows prorated strikethrough original', () => {
    const { item } = bayItem({ startTime: '16:00', duration: 2 });
    // afternoon 750 + evening 750 (promo, was 1250)
    expect(item.amount).toBe(1500);
    expect(item.originalAmount).toBe(2000); // 750 + 1250
  });

  test('same-price slots merge for display but drop the (now wrong) slot label', () => {
    const { item } = bayItem({ startTime: '16:00', duration: 2 });
    // 16:00–18:00 is not within "14:00 - 17:00", so no slot label
    expect(item.detail).toBe('2hr × ฿750/hr (Weekday)');
  });

  test('08:00 start inherits the morning rate instead of pricing at ฿0', () => {
    const { item } = bayItem({ startTime: '08:00', duration: 2 });
    expect(item.amount).toBe(1100);
  });

  test('non-half-hour start rounds amount to whole baht and hours to 2dp', () => {
    const { item } = bayItem({ startTime: '13:20', duration: 1 });
    expect(item.amount).toBe(617); // 2/3×550 + 1/3×750 = 616.67 → 617
    expect(item.detail).toBe('0.67hr × ฿550 + 0.33hr × ฿750 (Weekday)');
  });
});

describe('input guards', () => {
  test('NaN duration returns the empty breakdown instead of NaN amounts', () => {
    const breakdown = calculateCost({ ...baseInput, duration: NaN });
    expect(breakdown.lineItems).toHaveLength(0);
    expect(breakdown.estimatedTotal).toBe(0);
  });

  test('malformed startTime returns the empty breakdown', () => {
    const breakdown = calculateCost({ ...baseInput, startTime: 'abc' });
    expect(breakdown.lineItems).toHaveLength(0);
    expect(breakdown.estimatedTotal).toBe(0);
  });
});

describe('B1G1 free-hour discount uses the prorated cost of the last hour(s)', () => {
  test('13:30 2h weekday with B1G1: pay the prorated first hour (฿650), last hour free (฿750)', () => {
    const { breakdown, item } = bayItem({
      startTime: '13:30',
      duration: 2,
      applicablePromotions: [bogoPromo],
    });
    expect(item.amount).toBe(1400); // 0.5×550 + 1.5×750
    const promoDiscount = breakdown.discounts.find((d) => d.promotionId === 'promo-b1g1');
    expect(promoDiscount?.amount).toBe(-750); // free hour 14:30–15:30, all afternoon
    expect(breakdown.estimatedTotal).toBe(650);
  });

  test('12:30 2h weekday: the free hour itself straddles the boundary → −฿650', () => {
    const { breakdown } = bayItem({
      startTime: '12:30',
      duration: 2,
      applicablePromotions: [bogoPromo],
    });
    const promoDiscount = breakdown.discounts.find((d) => d.promotionId === 'promo-b1g1');
    expect(promoDiscount?.amount).toBe(-650); // 13:30–14:30 = 0.5×550 + 0.5×750
  });
});

describe('B1G1 club-rental disclosure note', () => {
  test('1h booking with a paid club set warns that club rental covers the free hour', () => {
    const { breakdown } = calculateCostWithClubs('premium');
    expect(breakdown.notes.some((n) => n.includes('charged on total play time'))).toBe(true);
  });

  test('1h booking without a paid club set has no club-rental clause', () => {
    const { breakdown } = calculateCostWithClubs('none');
    expect(breakdown.notes.some((n) => n.includes('charged on total play time'))).toBe(false);
  });

  function calculateCostWithClubs(clubRentalId: string) {
    const breakdown = calculateCost({
      ...baseInput,
      startTime: '13:30',
      duration: 1,
      clubRentalId,
      applicablePromotions: [bogoPromo],
    });
    return { breakdown };
  }
});

describe('club rental line is still priced on the booked duration', () => {
  test('13:30 1h premium set → ฿150', () => {
    const breakdown = calculateCost({ ...baseInput, startTime: '13:30', clubRentalId: 'premium' });
    const club = breakdown.lineItems.find((i) => i.id === 'club-rental');
    expect(club?.amount).toBe(150);
  });
});

describe('Early Bird package coverage splits at 14:00', () => {
  // Venue policy (owner-confirmed Jul 2026): an Early Bird booking crossing
  // 14:00 has its pre-14:00 portion covered by the package and the rest
  // charged at the normal prorated rate — it is NOT fully covered just
  // because it starts before 14:00.
  const ebInput: Partial<CostCalculationInput> = {
    hasActivePackage: true,
    packageDisplayName: 'Early Bird 10H',
  };

  function items(input: Partial<CostCalculationInput>) {
    const breakdown = calculateCost({ ...baseInput, ...ebInput, ...input });
    return {
      breakdown,
      covered: breakdown.lineItems.find((i) => i.id === 'bay-rate-covered'),
      charged: breakdown.lineItems.find((i) => i.id === 'bay-rate'),
    };
  }

  test('13:30 2h weekday: 0.5h covered + 1.5h × ฿750 charged → ฿1,125 total', () => {
    const { breakdown, covered, charged } = items({ startTime: '13:30', duration: 2 });

    expect(covered).toBeDefined();
    expect(covered?.amount).toBe(0);
    expect(covered?.isCoveredByPackage).toBe(true);
    expect(covered?.packageName).toBe('Early Bird 10H');
    expect(covered?.originalAmount).toBe(275); // 0.5 × ฿550

    expect(charged?.amount).toBe(1125); // 1.5 × ฿750
    expect(charged?.isCoveredByPackage).toBeUndefined();
    expect(charged?.detail).toBe('1.5hr × ฿750/hr (Weekday, 14:00 - 17:00)');

    expect(breakdown.estimatedTotal).toBe(1125);
    expect(breakdown.notes.some((n) => n.includes('covers until 14:00'))).toBe(true);
  });

  test('13:00 1h ends exactly at 14:00 → fully covered, single ฿0 bay line', () => {
    const { breakdown, covered, charged } = items({ startTime: '13:00', duration: 1 });
    expect(covered).toBeUndefined();
    expect(charged?.amount).toBe(0);
    expect(charged?.isCoveredByPackage).toBe(true);
    expect(breakdown.estimatedTotal).toBe(0);
  });

  test('14:00 start → not covered at all, existing morning-only note fires', () => {
    const { breakdown, covered, charged } = items({ startTime: '14:00', duration: 1 });
    expect(covered).toBeUndefined();
    expect(charged?.amount).toBe(750);
    expect(charged?.isCoveredByPackage).toBeUndefined();
    expect(breakdown.notes.some((n) => n.includes('morning hours only'))).toBe(true);
  });

  test('non-Early-Bird package crossing 14:00 stays fully covered', () => {
    const { breakdown, covered, charged } = items({
      startTime: '13:30',
      duration: 2,
      packageDisplayName: 'Gold 30H',
    });
    expect(covered).toBeUndefined();
    expect(charged?.amount).toBe(0);
    expect(charged?.isCoveredByPackage).toBe(true);
    expect(breakdown.estimatedTotal).toBe(0);
  });

  test('weekend crossing: 13:00 3h → 1h covered (฿750) + 2h × ฿950 charged', () => {
    const { breakdown, covered, charged } = items({
      date: WEEKEND,
      startTime: '13:00',
      duration: 3,
    });
    expect(covered?.originalAmount).toBe(750); // 1 × ฿750 weekend morning
    expect(charged?.amount).toBe(1900); // 2 × ฿950
    expect(breakdown.estimatedTotal).toBe(1900);
  });

  test('charged portion crossing into the evening promo slot prorates and merges display', () => {
    const { charged } = items({ startTime: '13:00', duration: 5 });
    // charged 14:00–18:00 weekday: 3h afternoon ฿750 + 1h evening ฿750 (promo)
    expect(charged?.amount).toBe(3000);
    expect(charged?.detail).toBe('4hr × ฿750/hr (Weekday)');
    // evening hour had a ฿1,250 pre-promo price → prorated strikethrough
    expect(charged?.originalAmount).toBe(3500);
  });

  test('B1G1 promo does not stack on a partially covered Early Bird booking', () => {
    const { breakdown } = items({
      startTime: '13:30',
      duration: 2,
      applicablePromotions: [bogoPromo],
    });
    expect(breakdown.discounts).toHaveLength(0);
  });

  test('a fixed-amount promo NOT scoped to bay_rate still applies on a split booking', () => {
    const totalPromo: ApplicablePromotion = {
      id: 'promo-total',
      promotion_type: 'fixed_amount',
      discount_value: 100,
      applies_to: 'total',
      conditions: {},
      title_en: '฿100 off',
      title_th: 'ลด ฿100',
    };
    const { breakdown } = items({
      startTime: '13:30',
      duration: 2,
      applicablePromotions: [totalPromo],
    });
    expect(breakdown.discounts.find((d) => d.promotionId === 'promo-total')?.amount).toBe(-100);
  });

  test('Thai note is present alongside the English one on a split booking', () => {
    const { breakdown } = items({ startTime: '13:30', duration: 2 });
    expect(breakdown.notesTh.some((n) => n.includes('14:00'))).toBe(true);
  });
});

/**
 * `packageRemainingHours` — the bay line reflects how many hours the package
 * actually has left, so a partially-covered booking stops previewing as ฿0.
 *
 * Weekday rates here: ฿550 before 14:00, ฿750 for 14:00–17:00, ฿750 promo
 * (was ฿1,250) after 17:00.
 */
describe('a package balance that runs short charges the uncovered tail', () => {
  const pkgInput: Partial<CostCalculationInput> = {
    hasActivePackage: true,
    packageDisplayName: 'Gold (30H)',
  };

  function items(input: Partial<CostCalculationInput>) {
    const breakdown = calculateCost({ ...baseInput, ...pkgInput, ...input });
    return {
      breakdown,
      covered: breakdown.lineItems.find((i) => i.id === 'bay-rate-covered'),
      charged: breakdown.lineItems.find((i) => i.id === 'bay-rate'),
    };
  }

  test('1 h left against a 1.5 h booking charges the TAIL at the afternoon rate', () => {
    const { breakdown, covered, charged } = items({
      startTime: '13:00', duration: 1.5, packageRemainingHours: 1,
    });

    expect(covered?.amount).toBe(0);
    expect(covered?.isCoveredByPackage).toBe(true);
    expect(covered?.packageName).toBe('Gold (30H)');
    expect(covered?.originalAmount).toBe(550);   // 13:00–14:00 × ฿550
    expect(covered?.detail).toBe('1hr × ฿550/hr (Weekday, Before 14:00)');

    // 14:00–14:30 = 0.5 × ฿750. The HEAD would have been 0.5 × ฿550 = ฿275.
    expect(charged?.amount).toBe(375);
    expect(charged?.isCoveredByPackage).toBeUndefined();
    expect(charged?.detail).toBe('0.5hr × ฿750/hr (Weekday, 14:00 - 17:00)');

    expect(breakdown.estimatedTotal).toBe(375);
  });

  test('...and specifically not the cheaper head of the booking', () => {
    const { charged } = items({ startTime: '13:00', duration: 1.5, packageRemainingHours: 1 });
    expect(charged?.amount).not.toBe(275);
  });

  test('a tail straddling 14:00 is itself prorated', () => {
    // 0.5 h balance from 13:00 → covered 13:00–13:30, charged 13:30–15:00.
    const { breakdown, covered, charged } = items({
      startTime: '13:00', duration: 2, packageRemainingHours: 0.5,
    });
    expect(covered?.originalAmount).toBe(275);   // 0.5 × ฿550
    expect(charged?.amount).toBe(1025);          // 0.5 × ฿550 + 1 × ฿750
    expect(charged?.detail).toBe('0.5hr × ฿550 + 1hr × ฿750 (Weekday)');
    expect(breakdown.estimatedTotal).toBe(1025);
  });

  test('a tail crossing 17:00 picks up the evening promo strikethrough', () => {
    // 1 h balance from 16:00 → charged 17:00–18:00, ฿750 promo (was ฿1,250).
    const { charged } = items({ startTime: '16:00', duration: 2, packageRemainingHours: 1 });
    expect(charged?.amount).toBe(750);
    expect(charged?.originalAmount).toBe(1250);
  });

  test('exact coverage is fully covered — one ฿0 bay line, no overage', () => {
    const { breakdown, covered, charged } = items({
      startTime: '13:00', duration: 1.5, packageRemainingHours: 1.5,
    });
    expect(covered).toBeUndefined();
    expect(charged?.amount).toBe(0);
    expect(charged?.isCoveredByPackage).toBe(true);
    expect(charged?.originalAmount).toBe(925);   // 1 × ฿550 + 0.5 × ฿750
    expect(breakdown.estimatedTotal).toBe(0);
  });

  test('a balance short by float dust does not manufacture a ฿0 tail', () => {
    const { covered, charged } = items({
      startTime: '13:00', duration: 1.5, packageRemainingHours: 1.5 - 1e-7,
    });
    expect(covered).toBeUndefined();
    expect(charged?.isCoveredByPackage).toBe(true);
  });

  test('an unlimited package stays fully covered whatever the balance says', () => {
    const { breakdown, covered, charged } = items({
      startTime: '13:00',
      duration: 3,
      packageRemainingHours: null,
      packageIsUnlimited: true,
    });
    expect(covered).toBeUndefined();
    expect(charged?.amount).toBe(0);
    expect(charged?.isCoveredByPackage).toBe(true);
    expect(breakdown.estimatedTotal).toBe(0);
  });

  test('a zero balance charges the whole booking and shows no covered line', () => {
    const { breakdown, covered, charged } = items({
      startTime: '13:00', duration: 1.5, packageRemainingHours: 0,
    });
    expect(covered).toBeUndefined();
    expect(charged?.amount).toBe(925);
    expect(charged?.isCoveredByPackage).toBeUndefined();
    expect(breakdown.estimatedTotal).toBe(925);
    expect(breakdown.notes.some((n) => n.includes('does not cover this whole booking'))).toBe(true);
  });

  test('a shortfall note is emitted in all five locales', () => {
    const { breakdown } = items({
      startTime: '13:00', duration: 1.5, packageRemainingHours: 1,
    });
    expect(breakdown.notes.some((n) => n.includes('does not cover this whole booking'))).toBe(true);
    expect(breakdown.notesTh.some((n) => n.includes('ไม่ครอบคลุมการจองนี้ทั้งหมด'))).toBe(true);
    expect(breakdown.notesJa.some((n) => n.includes('カバーできません'))).toBe(true);
    expect(breakdown.notesKo.some((n) => n.includes('이용할 수 없습니다'))).toBe(true);
    expect(breakdown.notesZh.some((n) => n.includes('不足以涵盖整个预订'))).toBe(true);
    // The name comes from the CRM, not a hardcoded fallback.
    expect(breakdown.notes.some((n) => n.startsWith('Gold (30H)'))).toBe(true);
  });

  test('promotions still do not stack on a partially-covered booking', () => {
    // `packageAppliesToBay` is keyed off eligibility, not the balance, so a
    // package holder who runs short keeps today's (non-stacking) behaviour.
    const { breakdown } = items({
      startTime: '13:00',
      duration: 2,
      packageRemainingHours: 0.5,
      applicablePromotions: [bogoPromo],
    });
    expect(breakdown.discounts).toHaveLength(0);
  });

  test('a Play & Food set still takes precedence and draws nothing down', () => {
    const { breakdown, covered, charged } = items({
      startTime: '13:00',
      duration: 1,
      playFoodPackageId: 'SET_A',
      packageRemainingHours: 0,
    });
    expect(covered).toBeUndefined();
    expect(charged).toBeUndefined();
    expect(breakdown.lineItems.find((i) => i.id === 'play-food')).toBeDefined();
    expect(breakdown.notes.some((n) => n.includes('does not cover this whole booking'))).toBe(false);
  });
});

/**
 * Best single offer only (owner-confirmed 2026-07-25). Offers NEVER stack: the
 * calculator evaluates every eligible promotion, applies the one worth the most,
 * and names the rest so the customer is not left thinking one was forgotten.
 *
 * Before this, every match pushed its own discount — two eligible B1G1 rows each
 * waived an hour and a ฿1,500 weekday booking previewed at ฿0.
 */
describe('only the best eligible offer applies', () => {
  const secondBogo: ApplicablePromotion = {
    ...bogoPromo,
    id: 'promo-weekday-b1g1',
    title_en: 'Weekday B1G1',
    title_th: 'วันธรรมดา B1G1',
  };
  const pctPromo: ApplicablePromotion = {
    id: 'promo-pct',
    promotion_type: 'percentage',
    discount_value: 20,
    applies_to: 'bay_rate',
    conditions: {},
    title_en: '20% Off',
    title_th: 'ลด 20%',
  };

  function withPromos(promos: ApplicablePromotion[], input: Partial<CostCalculationInput> = {}) {
    return calculateCost({
      ...baseInput, startTime: '14:00', duration: 2, applicablePromotions: promos, ...input,
    });
  }

  test('two identical bogos apply ONCE, not twice — the ฿0 preview is gone', () => {
    const breakdown = withPromos([bogoPromo, secondBogo]);
    expect(breakdown.subtotal).toBe(1500); // 2 × ฿750 weekday afternoon
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.totalDiscount).toBe(-750);
    expect(breakdown.estimatedTotal).toBe(750);
  });

  test('two bogos of different value pick the LARGER free-hours award', () => {
    const twoFreeHours: ApplicablePromotion = { ...bogoPromo, id: 'promo-b2g2', free_hours: 2 };
    const breakdown = withPromos([bogoPromo, twoFreeHours], { duration: 3 });
    expect(breakdown.subtotal).toBe(2250);                  // 3 × ฿750
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.discounts[0].promotionId).toBe('promo-b2g2');
    expect(breakdown.discounts[0].amount).toBe(-1500);      // 2 free hours, not 1
    expect(breakdown.estimatedTotal).toBe(750);
  });

  test('bogo vs percentage is decided by VALUE, not by type — bogo wins here', () => {
    // 2h × ฿750: bogo waives ฿750, 20% off waives ฿300.
    const breakdown = withPromos([pctPromo, bogoPromo]);
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.discounts[0].promotionId).toBe('promo-b1g1');
    expect(breakdown.discounts[0].amount).toBe(-750);
  });

  test('...and the percentage wins when IT is worth more', () => {
    // 3h × ฿750 = ฿2,250: bogo waives ฿750, 60% off waives ฿1,350.
    const bigPct: ApplicablePromotion = { ...pctPromo, discount_value: 60 };
    const breakdown = withPromos([bogoPromo, bigPct], { duration: 3 });
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.discounts[0].promotionId).toBe('promo-pct');
    expect(breakdown.discounts[0].amount).toBe(-1350);
  });

  test('a fixed_amount offer competes on the same value scale', () => {
    const bigFixed: ApplicablePromotion = {
      id: 'promo-fixed', promotion_type: 'fixed_amount', discount_value: 900,
      applies_to: 'total', conditions: {}, title_en: '฿900 off', title_th: 'ลด ฿900',
    };
    const breakdown = withPromos([bogoPromo, bigFixed]);
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.discounts[0].promotionId).toBe('promo-fixed'); // ฿900 > ฿750
  });

  test('a tie resolves on the lowest promotion id, independent of array order', () => {
    // Both waive the same ฿750, so only the tie-break can decide.
    const forward = withPromos([bogoPromo, secondBogo]);
    const reversed = withPromos([secondBogo, bogoPromo]);
    expect(forward.discounts[0].promotionId).toBe('promo-b1g1'); // < 'promo-weekday-b1g1'
    expect(reversed.discounts[0].promotionId).toBe('promo-b1g1');
    // Same winner either way — a JSON round-trip cannot flip it.
    expect(reversed).toEqual(forward);
  });

  test('every permutation of three offers yields the identical breakdown', () => {
    // Two promos cannot catch an order-dependent DISCLOSURE — the loser list has
    // one entry and reordering is unobservable. `/api/promotions/applicable` has
    // no ORDER BY and is edge-cached, so arrival order is genuinely arbitrary.
    const third: ApplicablePromotion = {
      ...pctPromo, id: 'promo-alpha', discount_value: 10, title_en: 'Alpha', title_th: 'อัลฟา',
    };
    const trio = [bogoPromo, secondBogo, third];
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ].map((order) => withPromos(order.map((i) => trio[i])));
    for (const breakdown of permutations) {
      expect(breakdown).toEqual(permutations[0]);
    }
    // ...and the loser list is genuinely ordered, most valuable first.
    const note = permutations[0].notes.find((n) => n.includes('Only one offer applies'))!;
    expect(note).toContain('Weekday B1G1, Alpha'); // ฿750 before ฿75
  });

  test('a duplicated promotion row is not named back at the customer', () => {
    // `id` is the PK, but a re-render that appends rather than replaces could
    // duplicate a row. Collapsing on id stops "Also considered: <the winner>".
    const breakdown = withPromos([bogoPromo, { ...bogoPromo }]);
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.estimatedTotal).toBe(750);
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
  });

  test('the losing offer is disclosed by name in all five locales', () => {
    const breakdown = withPromos([bogoPromo, secondBogo]);
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies per booking'))).toBe(true);
    expect(breakdown.notes.some((n) => n.includes('Weekday B1G1'))).toBe(true);
    expect(breakdown.notesTh.some((n) => n.includes('วันธรรมดา B1G1'))).toBe(true);
    expect(breakdown.notesJa.some((n) => n.includes('Weekday B1G1'))).toBe(true);
    expect(breakdown.notesKo.some((n) => n.includes('Weekday B1G1'))).toBe(true);
    expect(breakdown.notesZh.some((n) => n.includes('Weekday B1G1'))).toBe(true);
  });

  test('two losing offers are both named in one disclosure', () => {
    const third: ApplicablePromotion = { ...bogoPromo, id: 'promo-third', title_en: 'Third Offer' };
    const breakdown = withPromos([bogoPromo, secondBogo, third]);
    expect(breakdown.discounts).toHaveLength(1);
    const note = breakdown.notes.find((n) => n.includes('Only one offer applies'))!;
    expect(note).toContain('Weekday B1G1');
    expect(note).toContain('Third Offer');
  });

  test('a LONE offer is not disclosed as having competitors', () => {
    const breakdown = withPromos([bogoPromo]);
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
    expect(breakdown.notesTh.some((n) => n.includes('ใช้ได้เพียงหนึ่งโปรโมชัน'))).toBe(false);
  });

  test('no eligible offer means no disclosure and no discount', () => {
    const newOnly: ApplicablePromotion = {
      ...bogoPromo, conditions: { new_customer_only: true },
    };
    const breakdown = withPromos([newOnly, { ...secondBogo, conditions: { new_customer_only: true } }], {
      isNewCustomer: false,
    });
    expect(breakdown.discounts).toHaveLength(0);
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
  });

  test('a sub-2-hour bogo does NOT out-rank a real discount', () => {
    // 1h booking: the bogo can only advise (worth ฿0); 20% off saves ฿150.
    const breakdown = withPromos([bogoPromo, pctPromo], { duration: 1 });
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.discounts[0].promotionId).toBe('promo-pct');
    expect(breakdown.discounts[0].amount).toBe(-150); // 20% of ฿750
    expect(breakdown.estimatedTotal).toBe(600);
  });

  test("...and the losing bogo's 'book 2 hours' hint is suppressed, not shown alongside", () => {
    const breakdown = withPromos([bogoPromo, pctPromo], { duration: 1 });
    // Suppressed: at 2h that offer would COMPETE with the applied one and could
    // still lose, so promising a free hour on top would be a promise we can't keep.
    expect(breakdown.notes.some((n) => n.includes('Book 2 hours to get 1 hour free'))).toBe(false);
  });

  test('...and it is not named as an offer that lost, because it never competed', () => {
    // At 1 hour the bogo is worth ฿0 — it could not have applied whatever else
    // was on the table. Naming it would frame advice as a competition it lost:
    // "we applied the one worth the most. Also considered: Buy 1 Get 1 Free".
    const breakdown = withPromos([bogoPromo, pctPromo], { duration: 1 });
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
    expect(breakdown.notes.some((n) => n.includes('Buy 1 Get 1 Free'))).toBe(false);
    // The real discount still applies and is the only thing claimed.
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.discounts[0].promotionId).toBe('promo-pct');
  });

  test('a negative fixed_amount is never named as an offer that lost either', () => {
    // `value <= 0` is the rule, not `value === 0`: a nonsensical row that would
    // SURCHARGE the customer is not an offer they missed out on.
    const surcharge: ApplicablePromotion = {
      id: 'promo-negative', promotion_type: 'fixed_amount', discount_value: -50,
      applies_to: 'total', conditions: {}, title_en: 'Bad Row', title_th: 'แถวเสีย',
    };
    const breakdown = withPromos([surcharge, pctPromo]);
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.discounts[0].promotionId).toBe('promo-pct');
    expect(breakdown.notes.some((n) => n.includes('Bad Row'))).toBe(false);
  });

  test('two advice-only bogos apply NOTHING and claim nothing was applied', () => {
    // 1h booking, two eligible bogos: both are worth ฿0, so no discount exists.
    // Saying "we applied the one worth the most" beside a ฿0 saving is a claim
    // the breakdown itself contradicts.
    const breakdown = withPromos([bogoPromo, secondBogo], { duration: 1 });
    expect(breakdown.discounts).toHaveLength(0);
    expect(breakdown.estimatedTotal).toBe(750);
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
    // The winning offer's actionable hint is still there.
    expect(breakdown.notes.some((n) => n.includes('Book 2 hours to get 1 hour free'))).toBe(true);
  });

  test('a LONE sub-2-hour bogo still prints its hint (unchanged behaviour)', () => {
    const breakdown = withPromos([bogoPromo], { duration: 1 });
    expect(breakdown.discounts).toHaveLength(0);
    expect(breakdown.notes.some((n) => n.includes('Book 2 hours to get 1 hour free'))).toBe(true);
  });

  test('package coverage still suppresses EVERY offer, however many are eligible', () => {
    const breakdown = withPromos([bogoPromo, secondBogo, pctPromo], {
      startTime: '13:00', hasActivePackage: true, packageDisplayName: 'Gold (30H)',
    });
    expect(breakdown.discounts).toHaveLength(0);
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
    expect(breakdown.estimatedTotal).toBe(0);
  });

  test('a Play & Food set still suppresses every bay-rate offer', () => {
    const breakdown = withPromos([bogoPromo, secondBogo], { playFoodPackageId: 'SET_A' });
    expect(breakdown.discounts).toHaveLength(0);
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
  });

  test('a bay-rate offer suppressed by a package does not beat an eligible total offer', () => {
    // The bogo is gated off by package coverage, so the ฿100 total-scope offer
    // is the ONLY candidate and must apply un-competed and un-disclosed.
    const totalPromo: ApplicablePromotion = {
      id: 'promo-total', promotion_type: 'fixed_amount', discount_value: 100,
      applies_to: 'total', conditions: {}, title_en: '฿100 off', title_th: 'ลด ฿100',
    };
    const breakdown = withPromos([bogoPromo, totalPromo], {
      startTime: '13:00', hasActivePackage: true, packageDisplayName: 'Gold (30H)',
    });
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.discounts[0].promotionId).toBe('promo-total');
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
  });

  test('an offer whose free window prices to ฿0 is not disclosed as a competitor', () => {
    // free_hours: 0 is falsy, so this row was never a promotion at all; the
    // surviving offer must apply without a spurious "also considered".
    const zeroBogo: ApplicablePromotion = { ...bogoPromo, id: 'promo-zero', free_hours: 0 };
    const breakdown = withPromos([zeroBogo, pctPromo]);
    expect(breakdown.discounts).toHaveLength(1);
    expect(breakdown.discounts[0].promotionId).toBe('promo-pct');
    expect(breakdown.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
  });

  test('the winner is stable across the isNewCustomer refetch', () => {
    // `isNewCustomer` resolves from a phone lookup after first render. It can
    // only add or remove whole candidates — never reshuffle a fixed set.
    const newOnlyBig: ApplicablePromotion = {
      ...pctPromo, id: 'promo-pct-new', discount_value: 60, conditions: { new_customer_only: true },
    };
    const before = withPromos([bogoPromo, newOnlyBig], { duration: 3, isNewCustomer: false });
    const after = withPromos([bogoPromo, newOnlyBig], { duration: 3, isNewCustomer: true });
    expect(before.discounts[0].promotionId).toBe('promo-b1g1');   // ฿750, alone
    expect(before.notes.some((n) => n.includes('Only one offer applies'))).toBe(false);
    expect(after.discounts[0].promotionId).toBe('promo-pct-new'); // ฿1,350 wins
    // Re-running the same input is idempotent — no flicker between winners.
    expect(withPromos([bogoPromo, newOnlyBig], { duration: 3, isNewCustomer: true })).toEqual(after);
  });
});

describe('an unknown balance is byte-identical to the pre-balance calculator', () => {
  const pkgInput: CostCalculationInput = {
    ...baseInput,
    startTime: '13:00',
    duration: 1.5,
    hasActivePackage: true,
    packageDisplayName: 'Gold (30H)',
  };

  test('null and undefined both fall back to eligibility-only coverage', () => {
    const omitted = calculateCost(pkgInput);
    expect(calculateCost({ ...pkgInput, packageRemainingHours: null })).toEqual(omitted);
    expect(calculateCost({ ...pkgInput, packageRemainingHours: undefined })).toEqual(omitted);
    // ...which is the ฿0 preview a package holder has always seen. The balance
    // arrives from a fetch, so this is the FIRST-RENDER state; if it charged
    // anything the total would flicker ฿0 → charge → ฿0.
    expect(omitted.estimatedTotal).toBe(0);
    expect(omitted.lineItems.find((i) => i.id === 'bay-rate')!.isCoveredByPackage).toBe(true);
  });

  test('NaN is treated as unknown, not as zero', () => {
    expect(calculateCost({ ...pkgInput, packageRemainingHours: NaN }))
      .toEqual(calculateCost(pkgInput));
  });

  test('an Early Bird split is unchanged when no balance is given', () => {
    const eb = { ...pkgInput, packageDisplayName: 'Early Bird 10H', duration: 2 };
    expect(calculateCost({ ...eb, packageRemainingHours: null })).toEqual(calculateCost(eb));
  });
});
