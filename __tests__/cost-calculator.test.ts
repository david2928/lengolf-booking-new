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

  test('Thai note is present alongside the English one on a split booking', () => {
    const { breakdown } = items({ startTime: '13:30', duration: 2 });
    expect(breakdown.notesTh.some((n) => n.includes('14:00'))).toBe(true);
  });
});
