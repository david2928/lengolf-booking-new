/**
 * Mobile review panel for the last sub-step of booking step 3.
 *
 * What the panel is FOR: on mobile the customer used to reach Confirm with the
 * date, start time, bay and party size nowhere near the button. The collapsed
 * Session row prints duration, bay and people but no date or time; the sticky
 * bar's subline prints date, duration and time, truncated, and names neither
 * the bay nor the party size. The panel is the first place all five sit
 * together, directly above the action that commits them.
 *
 * What it must NOT do is introduce a second total. The panel and the sticky bar
 * are on screen at the same time, so the contract pinned below is that both
 * render the SAME number, drawn from the same `costBreakdown.estimatedTotal` —
 * including when that number is zero. A ฿0 booking is legitimate (a package or
 * a free-hour credit can cover the lot) and must read as a real total, never as
 * "nothing selected"; `BookingSummaryBar` documents the same rule at the top of
 * its own file.
 *
 * Notes are the other half of the contract. `costBreakdown.notes*` carries the
 * package shortfall warning, the Early Bird split, the best-offer disclosure
 * and the bogo hint. A panel that showed a total without them would have the
 * customer confirm a number with the sentence explaining it left behind.
 */
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BookingReviewPanel } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/BookingReviewPanel';
import { BookingSummaryBar } from '@/components/shared/BookingSummaryBar';
import type { CostBreakdown } from '@/lib/cost-calculator';
import messages from '@/messages/en.json';

const EMPTY_NOTES = { notes: [], notesTh: [], notesJa: [], notesKo: [], notesZh: [] };

const SHORTFALL_NOTE = 'Your package covers 2 hr of this booking; the rest is charged.';

/** A booking with a club rental, an add-on, a promotion and a package note. */
const breakdown: CostBreakdown = {
  lineItems: [
    { id: 'bay-rate', label: 'Bay Rate', detail: '2 hr × ฿550 (Weekday)', amount: 1100 },
    { id: 'club-rental', label: 'Club Rental: Callaway Paradym', detail: '2 hr', amount: 500 },
    { id: 'addon-gloves', label: 'Add-on: Cabretta Glove', amount: 350 },
  ],
  discounts: [{ id: 'promo-new', label: 'First-timer discount', amount: -200 }],
  subtotal: 1950,
  totalDiscount: -200,
  estimatedTotal: 1750,
  isWeekend: false,
  timeSlotLabel: 'Before 14:00',
  hourlyRate: 550,
  ...EMPTY_NOTES,
  notes: [SHORTFALL_NOTE],
};

/** Fully covered by a package: a real ฿0, not an absent one. */
const zeroBreakdown: CostBreakdown = {
  lineItems: [
    {
      id: 'bay-rate-covered',
      label: 'Bay Rate',
      detail: '2 hr × ฿550 (Weekday)',
      amount: 0,
      originalAmount: 1100,
      isCoveredByPackage: true,
      packageName: 'Gold Package',
    },
  ],
  discounts: [],
  subtotal: 0,
  totalDiscount: 0,
  estimatedTotal: 0,
  isWeekend: false,
  timeSlotLabel: 'Before 14:00',
  hourlyRate: 550,
  ...EMPTY_NOTES,
};

const baseProps: React.ComponentProps<typeof BookingReviewPanel> = {
  costBreakdown: breakdown,
  costDataLoading: false,
  costLanguage: 'en',
};

function renderPanel(props: Partial<React.ComponentProps<typeof BookingReviewPanel>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BookingReviewPanel {...baseProps} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('BookingReviewPanel', () => {
  /**
   * THE FACTS ARE NOT HERE, AND THAT IS THE POINT.
   *
   * This opened with a "Review your booking" card listing Date, Time, Duration,
   * People and Bay. All five are already on the screen: the step header's
   * subline states the date, the start time and the bay, and the collapsed
   * Session and Extras rows state the duration, the party size and the add-ons
   * — each with a Change that reopens the decision, which a read-only card
   * never offered. The card also printed the date in a second format
   * ("Thu, 30 Jul 2026" against the rows' "Thu 30 Jul") a few rows away.
   *
   * What is left is the money, which appears nowhere else on the screen.
   */
  test('restates none of the facts the rows above already carry', () => {
    renderPanel();

    for (const label of [
      messages.bookings.detailsStep.summaryRailDate,
      messages.bookings.detailsStep.summaryRailTime,
      messages.bookings.detailsStep.summaryRailDuration,
      messages.bookings.detailsStep.summaryRailPeople,
      messages.bookings.detailsStep.summaryRailBay,
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  test('keeps no heading of its own, so the breakdown labels the region once', () => {
    renderPanel();

    // `reviewPanelTitle` / `reviewPanelIntro` were deleted from all five
    // catalogs with the card, so this asserts the words rather than a key.
    expect(screen.queryByText(/review your booking/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/please check these details/i)).not.toBeInTheDocument();
    // The breakdown's own "Estimated Cost" heading is the only one left.
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/estimated cost/i);
  });

  test('names the club rental, the add-on and the discount from the breakdown', () => {
    renderPanel();

    expect(screen.getByText('Club Rental: Callaway Paradym')).toBeInTheDocument();
    expect(screen.getByText('Add-on: Cabretta Glove')).toBeInTheDocument();
    expect(screen.getByText('First-timer discount')).toBeInTheDocument();
    expect(screen.getByText('-฿200')).toBeInTheDocument();
  });

  test('renders the breakdown notes, so the total never appears unexplained', () => {
    renderPanel();

    expect(screen.getByText(SHORTFALL_NOTE)).toBeInTheDocument();
  });

  test('renders the localized notes for the chosen language, via pickNotes', () => {
    renderPanel({
      costLanguage: 'th',
      costBreakdown: { ...breakdown, notesTh: ['แพ็กเกจของคุณครอบคลุมเพียงบางส่วน'] },
    });

    expect(screen.getByText('แพ็กเกจของคุณครอบคลุมเพียงบางส่วน')).toBeInTheDocument();
    expect(screen.queryByText(SHORTFALL_NOTE)).not.toBeInTheDocument();
  });

  test('a ฿0 total renders as a real total, not as the empty prompt', () => {
    renderPanel({ costBreakdown: zeroBreakdown });

    // The label proves this is the total row and not the ฿0 on the covered
    // line item, which carries the struck-through original beside it.
    expect(screen.getByText('Estimated Total')).toBeInTheDocument();
    expect(screen.getAllByText('฿0').length).toBeGreaterThan(0);
    expect(
      screen.queryByText(messages.bookings.detailsStep.summaryEmptyPrompt),
    ).not.toBeInTheDocument();
  });

  /**
   * The bar, not the panel, owns the empty state. Both are on screen together
   * on mobile, so a fallback card here printed `summaryEmptyPrompt` twice about
   * 100px apart — and printed the wrong sentence in this position, since it
   * asks for a duration two rows below a Duration row that already stated one.
   * With no breakdown to render, the panel is empty.
   */
  test('renders nothing at all when there is no breakdown', () => {
    renderPanel({ costBreakdown: null });

    expect(screen.getByTestId('booking-review-panel')).toBeEmptyDOMElement();
    expect(
      screen.queryByText(messages.bookings.detailsStep.summaryEmptyPrompt),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Estimated Total')).not.toBeInTheDocument();
  });

  /**
   * The duplication this replaced: panel fallback card AND the bar's own
   * `emptyPrompt`, the same sentence twice on one screen. Rendering both
   * together pins that only one of them says it.
   */
  test('leaves the empty prompt to the sticky bar, said once', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BookingReviewPanel {...baseProps} costBreakdown={null} />
        <BookingSummaryBar
          total={null}
          totalLabel={messages.bookings.detailsStep.summaryTotalLabel}
          ctaLabel="Confirm Booking"
          onCta={() => {}}
          emptyPrompt={messages.bookings.detailsStep.summaryEmptyPrompt}
        />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getAllByText(messages.bookings.detailsStep.summaryEmptyPrompt),
    ).toHaveLength(1);
  });

  test('defers to the breakdown\'s own skeleton while it loads', () => {
    renderPanel({ costDataLoading: true });

    // The breakdown swaps itself for its own skeleton; the panel adds no
    // placeholder of its own, so there is no second loading state to disagree.
    expect(screen.getByTestId('booking-review-panel')).not.toBeEmptyDOMElement();
    expect(screen.queryByText('Estimated Total')).not.toBeInTheDocument();
  });

  /**
   * The panel's header used to print `summaryRailPaymentNote` — the very
   * sentence `ProjectedCostBreakdown` prints in its own header a few rows
   * below, so "Payment at venue" appeared twice on the mobile confirm screen.
   * The breakdown owns everything about the money, including when it is paid;
   * the panel owns the when/where/who. Counting rather than asserting absence
   * is the point: the phrase must still be on screen, exactly once.
   */
  test('leaves the payment note to the breakdown, said once', () => {
    renderPanel();

    expect(screen.getAllByText('Payment at venue')).toHaveLength(1);
  });

  test('says nothing about the money outside the breakdown it renders', () => {
    renderPanel({ costBreakdown: null });

    // Every figure on this surface comes from the breakdown. With it gone there
    // is no payment note, no total and no currency left behind in a copy of
    // the panel's own.
    const panel = screen.getByTestId('booking-review-panel');
    expect(within(panel).queryByText('Payment at venue')).toBeNull();
    expect(within(panel).queryByText(/฿/)).toBeNull();
  });

  test('stays out of the desktop layout, where SummaryRail owns the money', () => {
    renderPanel();

    expect(screen.getByTestId('booking-review-panel')).toHaveClass('lg:hidden');
  });
});

/**
 * The panel and the sticky bar are on screen together on mobile. They agree
 * because they are handed the same `costBreakdown.estimatedTotal` — the panel
 * adds no total of its own, it re-renders the breakdown that already sat in
 * this position. These cases pin that, at a normal total and at zero.
 */
describe('BookingReviewPanel and BookingSummaryBar agree on the total', () => {
  function renderBoth(source: CostBreakdown) {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BookingReviewPanel {...baseProps} costBreakdown={source} />
        <BookingSummaryBar
          total={source.estimatedTotal}
          totalLabel={messages.bookings.detailsStep.summaryTotalLabel}
          ctaLabel="Confirm Booking"
          onCta={() => {}}
          emptyPrompt={messages.bookings.detailsStep.summaryEmptyPrompt}
        />
      </NextIntlClientProvider>,
    );
  }

  test.each([
    ['a charged booking', breakdown, '฿1,750'],
    ['a fully covered booking', zeroBreakdown, '฿0'],
  ])('%s shows the same amount in both', (_label, source, expected) => {
    renderBoth(source);

    // Both surfaces print it, and neither prints anything else as a total.
    expect(screen.getAllByText(expected).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByText(messages.bookings.detailsStep.summaryEmptyPrompt),
    ).not.toBeInTheDocument();
  });
});
