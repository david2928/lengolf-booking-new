/**
 * Marketing opt-in visibility on booking step 3.
 *
 * The bug: the checkbox rendered for everyone with `checked={marketingOptIn}`,
 * and `marketingOptIn` starts hard-coded `false`. A customer who subscribed
 * months ago was shown an unticked "Send me LENGOLF news & offers" — the form
 * telling them, wrongly, that they were not on the list.
 *
 * There was never a data risk: `/api/bookings/create` is upgrade-only, so an
 * unticked box cannot revoke consent. This is purely about not lying.
 *
 * The contract, and the reason it is not a one-liner: `marketingPreference` is
 * TRI-state and only `true` is evidence of consent.
 *
 *   `true`  → subscribed. Show nothing at all: there is no decision to make,
 *             and a confirmation line in place of the box is a paragraph of
 *             unasked-for copy between the customer and the confirm button.
 *   `false` → deliberately opted out. Keep the checkbox; it is their way back.
 *   `null`  → unknown. Not loaded yet, a guest, or no linked customer record.
 *             Keep the checkbox.
 *
 * `null` is the one that matters, and it is the same unknown-versus-zero
 * discipline the package balance and credit balance already carry in
 * `useBookingDetailsForm`. `/api/vip/profile` is fetched in an effect, so
 * `null` is the state EVERY authenticated customer passes through on first
 * paint. Collapsing it into "subscribed" would hide the box during exactly
 * that window and silently cost a willing customer their chance to opt in —
 * a failure with no error, no log and no second attempt.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import {
  YourDetailsStep,
  isMarketingSubscribed,
  type YourDetailsStepProps,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/YourDetailsStep';
import messages from '@/messages/en.json';

const OPT_IN_LABEL = messages.bookings.detailsStep.marketingOptInLabel;
const OPT_IN_DESCRIPTION = messages.bookings.detailsStep.marketingOptInDescription;
/** The consent disclosure. One unconditional string now, not two variants. */
const CONSENT_NOTE = messages.bookings.detailsStep.consentNote;

/**
 * A returning customer with an email on file — the opt-in block is gated on a
 * non-empty email, so every case below needs one to reach the branch at all.
 */
const baseProps: YourDetailsStepProps = {
  name: 'David Geiermann',
  setName: () => {},
  phoneNumber: '+66812345678',
  setPhoneNumber: () => {},
  email: 'david@example.com',
  setEmail: () => {},
  errorField: null,
  setErrorField: () => {},
  phoneNumberError: '',
  emailError: '',
  isLineUser: false,
  isSignedIn: false,
  signInCallbackUrl: '/bookings',
  customerNotes: '',
  setCustomerNotes: () => {},
  costBreakdown: null,
  costDataLoading: false,
  costLanguage: 'en',
  isSubmitting: false,
  marketingOptIn: false,
  setMarketingOptIn: () => {},
  marketingPreference: null,
  // Prefilled, not typed — this fixture is a returning customer, so the card
  // branch is the one it exercises, exactly as before `contactTouched` existed.
  contactTouched: false,
  isEditingContact: false,
  onEditContact: () => {},
  alsoUpdateAccount: false,
  setAlsoUpdateAccount: () => {},
};

function renderStep(overrides: Partial<YourDetailsStepProps> = {}) {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={messages as never}>
      <YourDetailsStep {...baseProps} {...overrides} />
    </NextIntlClientProvider>,
  );
  return {
    checkbox: () => container.querySelector('#booking-marketing-opt-in'),
  };
}

describe('isMarketingSubscribed', () => {
  it('treats only true as subscribed', () => {
    expect(isMarketingSubscribed(true)).toBe(true);
  });

  it('does not treat a deliberate opt-out as subscribed', () => {
    expect(isMarketingSubscribed(false)).toBe(false);
  });

  it('does not treat an unloaded preference as subscribed', () => {
    // The regression guard. A truthy-vs-nullish slip here (`preference ?? true`,
    // `preference !== false`) passes every other test in this file.
    expect(isMarketingSubscribed(null)).toBe(false);
  });
});

describe('YourDetailsStep marketing opt-in', () => {
  /**
   * Owner-confirmed: an already-subscribed customer gets the whole block
   * removed, not swapped for a confirmation line. Nothing about the marketing
   * list survives — no checkbox, no label, no description, no standalone
   * sentence — because there is no decision to present.
   */
  it('drops the whole block when already subscribed', () => {
    const { checkbox } = renderStep({ marketingPreference: true });
    expect(checkbox()).toBeNull();
    expect(screen.queryByText(OPT_IN_LABEL)).toBeNull();
    expect(screen.queryByText(OPT_IN_DESCRIPTION)).toBeNull();
  });

  it('still shows the checkbox when the customer opted out (false)', () => {
    const { checkbox } = renderStep({ marketingPreference: false });
    expect(checkbox()).not.toBeNull();
    expect(screen.getByText(OPT_IN_LABEL)).toBeInTheDocument();
  });

  it('still shows the checkbox when the preference has not loaded (null)', () => {
    const { checkbox } = renderStep({ marketingPreference: null });
    expect(checkbox()).not.toBeNull();
    expect(screen.getByText(OPT_IN_LABEL)).toBeInTheDocument();
  });

  it('leaves the checkbox reflecting this booking, not the stored preference', () => {
    // `marketingPreference` is display-only. With a stored `false` and a
    // customer who has ticked the box for this booking, the box stays ticked —
    // the stored value must not be able to drive the control's state.
    const { checkbox } = renderStep({ marketingPreference: false, marketingOptIn: true });
    expect((checkbox() as HTMLInputElement).checked).toBe(true);
  });

  it('shows nothing before an email is entered', () => {
    // The block has always been gated on a non-empty email.
    const { checkbox } = renderStep({ marketingPreference: null, email: '   ' });
    expect(checkbox()).toBeNull();
    expect(screen.queryByText(OPT_IN_LABEL)).toBeNull();
  });
});

/**
 * The disclosure used to come in two variants: `consentNote`, and
 * `consentNoteWithOptIn`, which appended "Marketing emails are separate and use
 * the opt-in above." That clause was meta-commentary about an adjacent control
 * rather than a statement about the booking, and the checkbox 20px above it
 * already tells the reader they can unsubscribe from any email. The clause and
 * its key are gone from all five catalogs, leaving one unconditional sentence.
 *
 * Its PLACEMENT is now the point. It opens "By booking, you agree", so it
 * belongs against the control that books, not at the foot of a form section. It
 * must appear exactly once at every width, beside whichever confirm the
 * customer will actually press. This component carries the MOBILE copy
 * (`lg:hidden`, and last in the flow so it lands immediately above the fixed
 * `BookingSummaryBar`); `SummaryRail` carries the desktop copy under its own
 * Confirm button, inside an aside classed `hidden lg:block`. Those two classes
 * are exact complements of one breakpoint, so no viewport shows both and none
 * shows neither. `summary-rail.test.tsx` pins the other half of the pair.
 */
describe('YourDetailsStep consent note', () => {
  /**
   * `false` sits alongside `true` and `null` because this is the "always"
   * assertion, not a two-case one: the note is a terms-acceptance disclosure
   * attached to the act of booking, so no value of any prop may remove it. It
   * was asked whether returning customers could be spared it; they cannot. See
   * `ConsentNote` for why, including why the only available "has booked before"
   * signal defaults to "returning" and would have hidden it from first-timers
   * too.
   */
  it('states the booking-email consent whatever the stored preference', () => {
    for (const preference of [true, false, null] as const) {
      const { unmount } = render(
        <NextIntlClientProvider locale="en" messages={messages as never}>
          <YourDetailsStep {...baseProps} marketingPreference={preference} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(/post-visit review email/)).toBeInTheDocument();
      unmount();
    }
  });

  /**
   * The regression guard for collapsing the two variants into one. Every input
   * that used to switch them — the stored preference, and whether an email has
   * been typed at all — must now yield the SAME single sentence, exactly once.
   * `getAllByText` rather than `getByText` so a reintroduced second variant
   * fails as a count rather than passing on whichever copy it found first.
   */
  it('renders one unconditional note, whatever used to switch the variant', () => {
    const cases: Array<Partial<YourDetailsStepProps>> = [
      { marketingPreference: true },
      { marketingPreference: false },
      { marketingPreference: null },
      { marketingPreference: null, email: '   ' },
    ];

    for (const overrides of cases) {
      const { unmount } = render(
        <NextIntlClientProvider locale="en" messages={messages as never}>
          <YourDetailsStep {...baseProps} {...overrides} />
        </NextIntlClientProvider>,
      );
      expect(screen.getAllByText(CONSENT_NOTE)).toHaveLength(1);
      unmount();
    }
  });

  /**
   * The deleted clause, pinned at the source. A well-meaning restoration of the
   * "see the opt-in above" pointer would put back exactly the meta-commentary
   * that was removed, and the retired key must not reappear beside it.
   */
  it('says nothing about the marketing opt-in', () => {
    expect(CONSENT_NOTE).not.toMatch(/marketing/i);
    expect(CONSENT_NOTE).not.toMatch(/opt.?in/i);
    expect(Object.keys(messages.bookings.detailsStep)).not.toContain('consentNoteWithOptIn');
  });

  /**
   * The mobile half of the breakpoint pair. Without `lg:hidden` this copy and
   * the rail's would BOTH render above 1024px, roughly 300px apart — the exact
   * duplication the move was supposed to avoid is one missing class away.
   */
  it('carries the mobile half of the breakpoint pair', () => {
    renderStep({ marketingPreference: true });

    expect(screen.getByText(CONSENT_NOTE)).toHaveClass('lg:hidden');
  });

  /**
   * The disclosure is legally load-bearing, so it has to be legible. It sat at
   * `text-gray-400` — 2.5:1 against white, against the 4.5:1 WCAG AA wants for
   * 12px text. The instinct when copy feels repetitive is to fade it further;
   * that is the one change that costs something, so the floor is pinned.
   */
  it('keeps the disclosure above the contrast floor', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages as never}>
        <YourDetailsStep {...baseProps} marketingPreference={true} />
      </NextIntlClientProvider>,
    );

    const note = screen.getByText(CONSENT_NOTE);
    expect(note).not.toHaveClass('text-gray-400');
    expect(note).not.toHaveClass('text-gray-300');
    // Still the quietest thing on the step, just a readable version of quiet.
    expect(note).toHaveClass('text-xs');
  });
});
