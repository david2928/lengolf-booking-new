/**
 * Disclosure maths for "your package covers only part of this booking".
 *
 * The property that actually protects the customer is that the UNCOVERED
 * portion is the TAIL of the booking. Package hours are consumed from the
 * start, so a 13:00 booking of 1.5 h with 1 h of balance leaves 14:00–14:30
 * uncovered — the AFTERNOON rate. Pricing the head instead would quote ฿275
 * for something the venue charges ฿375 for, which is the same
 * quote-low-charge-high harm this slice was written to remove.
 *
 * No pricing API is loaded under Jest, so `getRates()` falls back to the
 * hardcoded defaults in `lib/liff/bay-rates-data.ts`:
 *   weekday 550 / 750 / 750 and weekend 750 / 950 / 950
 * for the before-14:00, 14:00–17:00 and 17:00–23:00 slots.
 */
import { computePackageCoverage, type PackageCoverageInput } from '@/lib/package-coverage';
import { calculateCost } from '@/lib/cost-calculator';

const WEEKDAY = '2026-07-15'; // Wednesday
const WEEKEND = '2026-07-18'; // Saturday

const base: PackageCoverageInput = {
  date: WEEKDAY,
  startTime: '13:00',
  duration: 1.5,
  hasActivePackage: true,
  packageDisplayName: 'Gold (30H)',
  remainingHours: 1,
};

describe('the uncovered portion is the tail, priced where it actually falls', () => {
  test('13:00 · 1.5 h · 1 h balance → the 14:00–14:30 tail at the afternoon rate (฿375)', () => {
    const c = computePackageCoverage(base)!;
    expect(c.isPartial).toBe(true);
    expect(c.coveredHours).toBe(1);
    expect(c.shortfallHours).toBe(0.5);
    // 0.5 h × ฿750 afternoon = ฿375.
    expect(c.shortfallCost).toBe(375);
  });

  test('...and NOT the morning rate the head of the booking sits at', () => {
    // 0.5 h × ฿550 morning = ฿275. Charging the head would understate by ฿100.
    expect(computePackageCoverage(base)!.shortfallCost).not.toBe(275);
  });

  test('the tail straddling 14:00 is itself prorated, not priced at one rate', () => {
    // 13:00 + 2 h, 0.5 h balance → covered 13:00–13:30, tail 13:30–15:00:
    // 0.5 h morning ฿275 + 1 h afternoon ฿750 = ฿1,025.
    const c = computePackageCoverage({ ...base, duration: 2, remainingHours: 0.5 })!;
    expect(c.shortfallHours).toBe(1.5);
    expect(c.shortfallCost).toBe(1025);
  });

  test('a tail crossing 17:00 picks up the evening rate', () => {
    // 16:00 + 2 h, 1 h balance → tail 17:00–18:00 = 1 h × ฿750 evening.
    const c = computePackageCoverage({
      ...base, startTime: '16:00', duration: 2, remainingHours: 1,
    })!;
    expect(c.shortfallCost).toBe(750);
  });

  test('a fractional start time is honoured when locating the tail', () => {
    // 13:30 + 1.5 h, 1 h balance → tail 14:30–15:00 = 0.5 h × ฿750 = ฿375.
    const c = computePackageCoverage({ ...base, startTime: '13:30' })!;
    expect(c.shortfallCost).toBe(375);
  });

  test('weekend rates apply to the tail', () => {
    // 13:00 + 1.5 h weekend, 1 h balance → tail 14:00–14:30 = 0.5 × ฿950.
    const c = computePackageCoverage({ ...base, date: WEEKEND })!;
    expect(c.shortfallCost).toBe(475);
  });

  test('a zero balance leaves the whole booking uncovered, priced end to end', () => {
    // 13:00 + 1.5 h, no balance → 1 h morning ฿550 + 0.5 h afternoon ฿375.
    const c = computePackageCoverage({ ...base, remainingHours: 0 })!;
    expect(c.coveredHours).toBe(0);
    expect(c.shortfallHours).toBe(1.5);
    expect(c.shortfallCost).toBe(925);
  });
});

describe('State A — the package has hours to spare', () => {
  test('more balance than the booking needs produces no warning', () => {
    const c = computePackageCoverage({ ...base, duration: 1.5, remainingHours: 12.5 })!;
    expect(c.isPartial).toBe(false);
    expect(c.shortfallHours).toBe(0);
    expect(c.shortfallCost).toBeNull();
    expect(c.coveredHours).toBe(1.5);
    expect(c.remainingAfter).toBe(11);
  });

  test('exact coverage is State A, not a ฿0 warning', () => {
    const c = computePackageCoverage({ ...base, duration: 2, remainingHours: 2 })!;
    expect(c.isPartial).toBe(false);
    expect(c.shortfallCost).toBeNull();
    expect(c.remainingAfter).toBe(0);
  });

  test('exact coverage on a fractional duration does not trip on float dust', () => {
    const c = computePackageCoverage({ ...base, duration: 2.5, remainingHours: 2.5 })!;
    expect(c.isPartial).toBe(false);
    expect(c.remainingAfter).toBe(0);
  });

  test('an unlimited package never warns and reports no balance', () => {
    const c = computePackageCoverage({
      ...base, duration: 5, remainingHours: null, isUnlimited: true,
    })!;
    expect(c.isUnlimited).toBe(true);
    expect(c.isPartial).toBe(false);
    expect(c.remainingAfter).toBeNull();
    expect(c.coveredHours).toBe(5);
  });
});

describe('Early Bird — the shortfall stays inside the package-eligible window', () => {
  const earlyBird = { ...base, packageDisplayName: 'Early Bird 10H' };

  test('a booking crossing 14:00 measures the shortfall before the cutoff only', () => {
    // 13:00 + 2 h with 0.5 h balance. Eligible window is 13:00–14:00 (1 h);
    // covered 0.5 h; shortfall is 13:30–14:00 = 0.5 h × ฿550 = ฿275.
    // The 14:00–15:00 hour is already a charged line in the calculator's
    // breakdown — counting it here too would double-bill it in the warning.
    const c = computePackageCoverage({ ...earlyBird, duration: 2, remainingHours: 0.5 })!;
    expect(c.coveredHours).toBe(0.5);
    expect(c.shortfallHours).toBe(0.5);
    expect(c.shortfallCost).toBe(275);
    // `eligibleHours` alone is what prevents the double count, so the shortfall
    // is still fully outside the estimate and MUST be disclosed. The calculator
    // zeroes the whole 13:00–14:00 hour even though the balance pays for half.
    expect(c.isPartial).toBe(true);
    expect(c.coversWholeBooking).toBe(false);
  });

  test('the calculator really does zero an hour the balance cannot pay for', () => {
    // Pins the premise of the test above: without this, an Early Bird shortfall
    // could plausibly be dismissed as already covered by the charged line.
    const breakdown = calculateCost({
      date: WEEKDAY,
      startTime: '13:00',
      duration: 2,
      clubRentalId: 'none',
      hasActivePackage: true,
      packageDisplayName: 'Early Bird 10H',
      isNewCustomer: false,
      applicablePromotions: [],
    });
    // 13:00–14:00 zeroed in full; only 14:00–15:00 is charged.
    expect(breakdown.lineItems.find((i) => i.id === 'bay-rate-covered')!.amount).toBe(0);
    expect(breakdown.lineItems.find((i) => i.id === 'bay-rate')!.amount).toBe(750);
    expect(breakdown.estimatedTotal).toBe(750);
    // ...so the ฿275 the balance cannot cover is nowhere in the total.
    expect(
      computePackageCoverage({ ...earlyBird, duration: 2, remainingHours: 0.5 })!.shortfallCost,
    ).toBe(275);
  });

  test('ample balance on a booking crossing 14:00 is State A — the calculator already discloses the cutoff', () => {
    const c = computePackageCoverage({ ...earlyBird, duration: 2, remainingHours: 10 })!;
    expect(c.isPartial).toBe(false);
    expect(c.coveredHours).toBe(1);   // only the pre-14:00 hour draws down
    expect(c.remainingAfter).toBe(9);
  });

  test('an Early Bird booking starting after 14:00 shows no card at all', () => {
    // The package pays for none of it. A card reading "10 hrs left after this
    // booking" beside a fully-charged bay reads as reassurance about a discount
    // the customer is not getting; the calculator's own "covers morning hours
    // only (before 14:00)" note is the honest disclosure here.
    expect(computePackageCoverage({
      ...earlyBird, startTime: '15:00', duration: 2, remainingHours: 10,
    })).toBeNull();
    // Exactly at the cutoff too.
    expect(computePackageCoverage({
      ...earlyBird, startTime: '14:00', duration: 1, remainingHours: 10,
    })).toBeNull();
  });
});

describe('a shortfall too small to cost anything is not a shortfall', () => {
  test('a balance short by float dust does not produce a "0 hrs is ฿0" warning', () => {
    const c = computePackageCoverage({ ...base, duration: 1.5, remainingHours: 1.5 - 1e-7 })!;
    expect(c.isPartial).toBe(false);
    expect(c.shortfallHours).toBe(0);
    expect(c.shortfallCost).toBeNull();
  });

  test('a genuine half-hour shortfall still warns', () => {
    expect(computePackageCoverage({ ...base, duration: 1.5, remainingHours: 1 })!.isPartial)
      .toBe(true);
  });
});

describe('malformed start times are rejected rather than priced', () => {
  test.each(['25:00', '-1:00', '13:xx', '13:60', 'abc', '', ':30'])('%s → null', (startTime) => {
    expect(computePackageCoverage({ ...base, startTime })).toBeNull();
  });

  test('a bare hour with no minutes is still accepted', () => {
    expect(computePackageCoverage({ ...base, startTime: '13' })).not.toBeNull();
  });
});

/**
 * KNOWN, DELIBERATE DIVERGENCE — pinned so nobody "fixes" the copy instead of
 * the cause. `calculateCost` takes `hasActivePackage: boolean` and has no
 * balance input at all, so it zeroes the whole bay line even when the balance
 * cannot pay for it. The disclosure card therefore presents its overage as an
 * amount charged AT THE VENUE and explicitly not included in the estimate.
 * Changing pricing to consume the balance is out of scope for this slice.
 */
describe('the calculator zeroes the bay line regardless of balance', () => {
  test('a 1 h balance against a 1.5 h booking still previews ฿0 bay', () => {
    const breakdown = calculateCost({
      date: WEEKDAY,
      startTime: '13:00',
      duration: 1.5,
      clubRentalId: 'none',
      hasActivePackage: true,
      packageDisplayName: 'Gold (30H)',
      isNewCustomer: false,
      applicablePromotions: [],
    });
    const bay = breakdown.lineItems.find((i) => i.id === 'bay-rate')!;
    expect(bay.isCoveredByPackage).toBe(true);
    expect(bay.amount).toBe(0);
    expect(breakdown.estimatedTotal).toBe(0);

    // ...while the disclosure correctly says ฿375 of it is not covered.
    expect(computePackageCoverage(base)!.shortfallCost).toBe(375);
  });
});

describe('no card at all', () => {
  test('no active package', () => {
    expect(computePackageCoverage({ ...base, hasActivePackage: false })).toBeNull();
  });

  test('a Play & Food set is priced as a set — the package covers nothing', () => {
    expect(computePackageCoverage({ ...base, playFoodPackageId: 'SET_B' })).toBeNull();
  });

  test('an unknown balance shows nothing rather than a fabricated overage', () => {
    expect(computePackageCoverage({ ...base, remainingHours: null })).toBeNull();
  });

  test('an unparseable window or non-positive duration', () => {
    expect(computePackageCoverage({ ...base, startTime: '' })).toBeNull();
    expect(computePackageCoverage({ ...base, duration: 0 })).toBeNull();
    expect(computePackageCoverage({ ...base, duration: NaN })).toBeNull();
  });
});
