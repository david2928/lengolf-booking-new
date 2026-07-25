/**
 * Desktop summary rail for booking step 3.
 *
 * The contract that matters: a booking crossing the 14:00 / 17:00 rate
 * boundaries is priced per portion, and the rail must show each portion on its
 * own line. The calculator hands that split over as ONE `bay-rate` line item
 * whose detail reads `"2hr × ฿550 + 1hr × ฿750 (Weekday)"`, so a rail that just
 * printed `detail` would bury the split most customers ask about in a wrapped
 * run-on inside a 296px column.
 *
 * The rail also owns no validation: its button calls straight back out to the
 * form hook's `handlePrimaryCta`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { SummaryRail } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/SummaryRail';
import { calculateCost, type CostBreakdown } from '@/lib/cost-calculator';
import messages from '@/messages/en.json';

const EMPTY_NOTES = { notes: [], notesTh: [], notesJa: [], notesKo: [], notesZh: [] };

/** 12:00–15:00 on a weekday: two hours at ฿550, one at ฿750. */
const proratedBreakdown: CostBreakdown = {
  lineItems: [
    {
      id: 'bay-rate',
      label: 'Bay Rate',
      detail: '2hr × ฿550 + 1hr × ฿750 (Weekday)',
      amount: 1850,
    },
    {
      id: 'club-rental',
      label: 'Club Rental — Standard Set',
      detail: '3hr',
      amount: 0,
    },
  ],
  discounts: [{ id: 'promo-new', label: 'First-timer discount', amount: -100 }],
  subtotal: 1850,
  totalDiscount: -100,
  estimatedTotal: 1750,
  isWeekend: false,
  timeSlotLabel: 'Before 14:00',
  hourlyRate: 550,
  ...EMPTY_NOTES,
};

const baseRailProps: React.ComponentProps<typeof SummaryRail> = {
  costBreakdown: proratedBreakdown,
  costDataLoading: false,
  costLanguage: 'en',
  selectedDate: new Date('2026-07-15T12:00:00'),
  selectedTime: '12:00',
  duration: 3,
  numberOfPeople: 2,
  bayLabel: 'Social Bay',
  ctaLabel: 'Confirm Booking',
  onCta: () => {},
  formatDate: (d) => d.toDateString(),
};

function renderRail(props: Partial<React.ComponentProps<typeof SummaryRail>> = {}) {
  const onCta = jest.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SummaryRail {...baseRailProps} onCta={onCta} {...props} />
    </NextIntlClientProvider>,
  );
  return { onCta };
}

describe('SummaryRail', () => {
  test('renders each prorated bay-rate portion as its own line', () => {
    renderRail();

    const first = screen.getByText('2hr × ฿550');
    const second = screen.getByText('1hr × ฿750');

    expect(first).toBeInTheDocument();
    expect(second).toBeInTheDocument();
    // Separate lines, not one wrapped string.
    expect(first).not.toBe(second);
    expect(first.tagName).toBe('LI');
    expect(second.tagName).toBe('LI');
    // The day / slot qualifier is stated once, under the portions.
    expect(screen.getByText('Weekday')).toBeInTheDocument();
    // And the compound detail is NOT also printed verbatim.
    expect(
      screen.queryByText('2hr × ฿550 + 1hr × ฿750 (Weekday)'),
    ).not.toBeInTheDocument();
  });

  // Guards the same thing against a change in the calculator rather than in
  // the rail: if `buildBayRateDetail` ever stops joining portions with ' + ',
  // the split silently collapses back to one line.
  test('splits a real calculator breakdown that crosses the 14:00 boundary', () => {
    const breakdown = calculateCost({
      date: '2026-07-15', // Wednesday
      startTime: '12:00',
      duration: 3,
      clubRentalId: 'none',
      hasActivePackage: false,
      isNewCustomer: false,
      applicablePromotions: [],
    });

    renderRail({ costBreakdown: breakdown });

    const portions = screen.getAllByRole('listitem');
    expect(portions).toHaveLength(2);
    portions.forEach((portion) => expect(portion.textContent).toMatch(/×/));
  });

  test('leaves a single-rate detail on one line', () => {
    renderRail({
      costBreakdown: {
        ...proratedBreakdown,
        lineItems: [
          {
            id: 'bay-rate',
            label: 'Bay Rate',
            detail: '1hr × ฿550/hr (Weekday, Before 14:00)',
            amount: 550,
          },
        ],
      },
    });

    expect(
      screen.getByText('1hr × ฿550/hr (Weekday, Before 14:00)'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  test('renders the total', () => {
    renderRail();
    expect(screen.getByText('฿1,750')).toBeInTheDocument();
  });

  test('renders discounts as a negative amount', () => {
    renderRail();
    expect(screen.getByText('-฿100')).toBeInTheDocument();
  });

  test('the CTA calls onCta', async () => {
    const { onCta } = renderRail();
    const button = screen.getByRole('button', { name: 'Confirm Booking' });

    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  test('the CTA is disabled only while a submit is in flight', async () => {
    const { onCta } = renderRail({ ctaLoading: true });
    const button = screen.getByRole('button', { name: /Confirm Booking/ });

    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onCta).not.toHaveBeenCalled();
  });

  test('renders the booking facts', () => {
    renderRail();
    expect(screen.getByText('12:00')).toBeInTheDocument();
    expect(screen.getByText('3 hr')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Social Bay')).toBeInTheDocument();
  });
});

/**
 * The rail's Confirm button and the chat FAB both end up in the viewport's
 * bottom-right corner on a short laptop viewport (measured 1px apart at
 * 1280x720). `has-summary-rail` is how the rail tells the FAB to get out of the
 * way — above `lg:` the rule in app/globals.css hides it outright, since the
 * rail will keep growing and no fixed offset can clear an unknown height —
 * without either component importing the other. The refcount matters for the
 * same reason it does on BookingSummaryBar: an overlapping mount must not let
 * the first unmount strip the class from under a still-mounted sibling, which
 * would drop the FAB back onto the button.
 */
describe('SummaryRail has-summary-rail body class (refcounted)', () => {
  afterEach(() => {
    document.body.classList.remove('has-summary-rail');
  });

  test('adds the class while mounted and removes it on unmount', () => {
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SummaryRail {...baseRailProps} />
      </NextIntlClientProvider>,
    );
    expect(document.body.classList.contains('has-summary-rail')).toBe(true);

    unmount();
    expect(document.body.classList.contains('has-summary-rail')).toBe(false);
  });

  test('keeps the class present after unmounting one of two mounted instances', () => {
    const a = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SummaryRail {...baseRailProps} />
      </NextIntlClientProvider>,
    );
    const b = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SummaryRail {...baseRailProps} />
      </NextIntlClientProvider>,
    );
    expect(document.body.classList.contains('has-summary-rail')).toBe(true);

    a.unmount();
    expect(document.body.classList.contains('has-summary-rail')).toBe(true);

    b.unmount();
    expect(document.body.classList.contains('has-summary-rail')).toBe(false);
  });
});
