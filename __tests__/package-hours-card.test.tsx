/**
 * The package-hours card in booking step 3's Extras panel.
 *
 * What matters here is which of the two states the customer sees, and that the
 * State B sentence carries the real prorated overage rather than a round
 * number. The maths itself is covered in `package-coverage.test.ts`; this file
 * asserts the wiring and the copy, in particular:
 *
 *  - a package with hours to spare shows the balance and NO warning;
 *  - a package that runs out mid-booking shows the tail's real cost, and says
 *    plainly that the amount IS in the estimate (it is — the calculator takes
 *    the same balance and charges the uncovered tail);
 *  - fractional durations read correctly through the ICU plural, since the
 *    ladder now offers 1.5 / 2.5 h.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useFormatter } from 'next-intl';
import { PackageHoursCard } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/PackageHoursCard';
import { computePackageCoverage, type PackageCoverageInput } from '@/lib/package-coverage';
import messages from '@/messages/en.json';

const WEEKDAY = '2026-07-15'; // Wednesday

const baseCoverageInput: PackageCoverageInput = {
  date: WEEKDAY,
  startTime: '13:00',
  duration: 1.5,
  hasActivePackage: true,
  packageDisplayName: 'Gold (30H)',
  remainingHours: 1,
};

/** Feeds the real `useFormatter` in, the way the parent component does. */
function Harness(props: Omit<React.ComponentProps<typeof PackageHoursCard>, 'formatter'>) {
  const formatter = useFormatter();
  return <PackageHoursCard {...props} formatter={formatter} />;
}

function renderCard(
  input: Partial<PackageCoverageInput>,
  balance: { totalHours: number | null; usedHours: number | null; expiryDate: string | null },
) {
  const coverage = computePackageCoverage({ ...baseCoverageInput, ...input });
  if (!coverage) throw new Error('expected coverage — this test needs a card');
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <Harness
        coverage={coverage}
        packageDisplayName={(input.packageDisplayName ?? baseCoverageInput.packageDisplayName)!}
        totalHours={balance.totalHours}
        usedHours={balance.usedHours}
        expiryDate={balance.expiryDate}
      />
    </NextIntlClientProvider>,
  );
}

describe('State A — hours to spare', () => {
  beforeEach(() => {
    renderCard(
      { duration: 1.5, remainingHours: 12.5 },
      { totalHours: 30, usedHours: 17.5, expiryDate: '2026-08-31' },
    );
  });

  test('names the package and its expiry', () => {
    expect(screen.getByText('Gold (30H)')).toBeInTheDocument();
    // Locale-formatted, and NOT off by one: `new Date('2026-08-31')` would be
    // UTC midnight and could render as the 30th, so the component parses the
    // yyyy-MM-dd expiry into a local calendar date instead.
    expect(screen.getByText('Expires Aug 31, 2026')).toBeInTheDocument();
  });

  test('shows the used-versus-total meter caption', () => {
    expect(screen.getByText('17.5 of 30 hrs used')).toBeInTheDocument();
  });

  test('states what this booking consumes and what is left after it', () => {
    expect(screen.getByText('This booking uses 1.5 hrs')).toBeInTheDocument();
    expect(screen.getByText('11 hrs left after this booking')).toBeInTheDocument();
  });

  test('shows no overage warning', () => {
    expect(screen.queryByText(/longer than your package covers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/included in the estimated total/i)).not.toBeInTheDocument();
  });
});

describe('State B — the package runs out mid-booking', () => {
  test('quotes the prorated TAIL, not the cheaper head of the booking', () => {
    renderCard(
      { duration: 1.5, remainingHours: 1 },
      { totalHours: 10, usedHours: 9, expiryDate: '2026-08-31' },
    );
    expect(screen.getByText('This booking is longer than your package covers')).toBeInTheDocument();
    // 14:00–14:30 at the afternoon rate: 0.5 × ฿750 = ฿375.
    // The morning-rate answer would have been ฿275.
    expect(
      screen.getByText('Your package covers 1 hr of this 1.5 hrs booking. The remaining 0.5 hrs is ฿375.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/฿275/)).not.toBeInTheDocument();
  });

  test('says plainly that the amount IS in the estimate', () => {
    renderCard(
      { duration: 1.5, remainingHours: 1 },
      { totalHours: 10, usedHours: 9, expiryDate: null },
    );
    // The sticky bar and desktop rail both print `estimatedTotal`, which now
    // contains this ฿375 because the calculator takes the same balance. The card
    // must therefore say the amount is included, not disclaim it — two different
    // numbers on one screen is worse than either alone.
    expect(
      screen.getByText('This amount is already included in the estimated total.'),
    ).toBeInTheDocument();
  });

  test('a zero balance warns for the whole booking', () => {
    renderCard(
      { duration: 1.5, remainingHours: 0 },
      { totalHours: 10, usedHours: 10, expiryDate: null },
    );
    // 1 h morning ฿550 + 0.5 h afternoon ฿375 = ฿925.
    expect(screen.getByText(/The remaining 1.5 hrs is ฿925\./)).toBeInTheDocument();
    // Nothing is drawn down, so the "this booking uses" line is suppressed.
    expect(screen.queryByText(/This booking uses/)).not.toBeInTheDocument();
  });

  test('an Early Bird shortfall is still disclosed, without claiming a booking total', () => {
    // `covered + uncovered` here is the pre-14:00 eligible window, not the 2 h
    // booking, so this variant must not say "of this 2 hrs booking" — the hours
    // would not add up, and the post-14:00 hour is a bay line of its own.
    renderCard(
      { packageDisplayName: 'Early Bird 10H', duration: 2, remainingHours: 0.5 },
      { totalHours: 10, usedHours: 9.5, expiryDate: null },
    );
    expect(
      screen.getByText(
        'Your package balance covers only 0.5 hrs of this booking. The next 0.5 hrs is ฿275.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/included in the estimated total/i)).toBeInTheDocument();
    // No "of this N booking" claim in the capped variant.
    expect(screen.queryByText(/of this 2 hrs booking/)).not.toBeInTheDocument();
    expect(screen.getByText('9.5 of 10 hrs used')).toBeInTheDocument();
  });
});

describe('unlimited packages', () => {
  test('report unlimited hours with no meter and no warning', () => {
    renderCard(
      { duration: 5, remainingHours: null, isUnlimited: true },
      { totalHours: null, usedHours: null, expiryDate: '2026-12-31' },
    );
    expect(screen.getByText('Unlimited hours')).toBeInTheDocument();
    expect(screen.queryByText(/hrs used/)).not.toBeInTheDocument();
    expect(screen.queryByText(/left after this booking/)).not.toBeInTheDocument();
    expect(screen.queryByText(/longer than your package covers/i)).not.toBeInTheDocument();
  });
});

describe('singular hour counts read correctly', () => {
  test('exactly one hour uses "hr", not "hrs"', () => {
    renderCard(
      { duration: 1, remainingHours: 2 },
      { totalHours: 10, usedHours: 8, expiryDate: null },
    );
    expect(screen.getByText('This booking uses 1 hr')).toBeInTheDocument();
    expect(screen.getByText('1 hr left after this booking')).toBeInTheDocument();
  });
});
