/**
 * The free-hour credit card in booking step 3's Extras panel.
 *
 * Three things can make this card actively harmful, and each has a test here:
 *
 *  - Rendering at a zero balance. Exactly one customer in the system has any
 *    credit today, so an empty-state card would be noise on essentially every
 *    booking. Nothing renders — no heading, no "0 hours".
 *  - Hiding the expiry. A free hour the customer never knew was expiring is
 *    worse than one they never knew about.
 *  - Implying the credit is self-serve or already discounted. Customers cannot
 *    redeem (staff apply it from lengolf-forms) and `lib/cost-calculator.ts`
 *    does not know credits exist, so the estimate does NOT contain them.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useFormatter } from 'next-intl';
import {
  CreditBalanceCard,
  type CreditGrantBalance,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/CreditBalanceCard';
import messages from '@/messages/en.json';

/** Feeds the real `useFormatter` in, the way the parent component does. */
function Harness({ credits }: { credits: CreditGrantBalance[] | null }) {
  const formatter = useFormatter();
  return <CreditBalanceCard credits={credits} formatter={formatter} />;
}

function renderCard(credits: CreditGrantBalance[] | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <Harness credits={credits} />
    </NextIntlClientProvider>,
  );
}

// End of 1 August 2026 in Bangkok, which is what `b1g1CreditExpiry` stores.
const B1G1_EXPIRY = '2026-08-01T16:59:59.999Z';

describe('nothing renders when there is nothing to show', () => {
  test('a zero balance renders absolutely nothing', () => {
    const { container } = renderCard([]);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/free hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 hr/i)).not.toBeInTheDocument();
  });

  test('a balance that has not loaded yet is not treated as a zero — it also renders nothing', () => {
    // `null` and `[]` are different states (see the `?? null` convention in
    // useBookingDetailsForm) and both must stay invisible. A "0 hrs" flash
    // before the fetch resolves would be a lie told to every customer.
    const { container } = renderCard(null);
    expect(container).toBeEmptyDOMElement();
  });

  test('grants that net to zero hours render nothing', () => {
    const { container } = renderCard([{ hours: 0, expiresAt: B1G1_EXPIRY }]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('a single grant — the B1G1 free hour', () => {
  beforeEach(() => {
    renderCard([{ hours: 1, expiresAt: B1G1_EXPIRY }]);
  });

  test('names the balance in singular hours', () => {
    expect(screen.getByText('Your free hours')).toBeInTheDocument();
    expect(screen.getByText('1 hr')).toBeInTheDocument();
  });

  test('shows the expiry, read in Bangkok', () => {
    // Stored as 16:59:59.999Z, which is 23:59 on the 1st in Bangkok. Rendering
    // in any other zone could print the 2nd (east) or the 1st-minus-one (west);
    // the venue's calendar day is the one the customer is held to.
    expect(screen.getByText('Use by Aug 1, 2026')).toBeInTheDocument();
  });

  test('says staff apply it, and that it is NOT in the estimate', () => {
    expect(
      screen.getByText(
        'Mention this when you arrive and our team will apply it. It is not included in the estimated total.',
      ),
    ).toBeInTheDocument();
    // No self-service affordance anywhere on the card — the sentence above is
    // the whole interaction model. A button or checkbox here would promise a
    // redemption path that does not exist in this app.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // ...and the copy must not claim the money is already off the quote.
    expect(screen.queryByText(/already included/i)).not.toBeInTheDocument();
  });
});

describe('more than one grant', () => {
  test('totals the hours but keeps each grant its own deadline, soonest first', () => {
    // `get_credit_balance` returns soonest-expiry-first and the card preserves
    // that order. Collapsing several grants onto one date would be wrong for
    // every grant but the first.
    renderCard([
      { hours: 1, expiresAt: B1G1_EXPIRY },
      { hours: 2.5, expiresAt: '2026-09-30T16:59:59.999Z' },
    ]);

    expect(screen.getByText('3.5 hrs')).toBeInTheDocument();

    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['1 hr — use by Aug 1, 2026', '2.5 hrs — use by Sep 30, 2026']);
  });
});
