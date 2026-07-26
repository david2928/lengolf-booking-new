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
/** The consent note in its two forms. Only the second points at the opt-in. */
const CONSENT_NOTE = messages.bookings.detailsStep.consentNote;
const CONSENT_NOTE_WITH_OPT_IN = messages.bookings.detailsStep.consentNoteWithOptIn;

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
  customerNotes: '',
  setCustomerNotes: () => {},
  costBreakdown: null,
  costDataLoading: false,
  costLanguage: 'en',
  review: {
    selectedDate: new Date('2026-07-15T12:00:00'),
    selectedTime: '12:00',
    durationLabel: '1 hr',
    numberOfPeople: 2,
    bayLabel: 'Social Bay',
    formatDate: (d: Date) => d.toDateString(),
  },
  isSubmitting: false,
  marketingOptIn: false,
  setMarketingOptIn: () => {},
  marketingPreference: null,
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
 * The consent note's marketing clause is a pointer ("see the opt-in above"),
 * and the thing it points at is conditional. When the block is suppressed the
 * clause referred to nothing on screen, so the note has two complete variants
 * gated on exactly the flag that renders the checkbox.
 */
describe('YourDetailsStep consent note', () => {
  it('points at the opt-in only when the opt-in is on screen', () => {
    renderStep({ marketingPreference: null });

    expect(screen.getByText(CONSENT_NOTE_WITH_OPT_IN)).toBeInTheDocument();
    expect(screen.queryByText(CONSENT_NOTE)).toBeNull();
  });

  it('drops the clause for an already-subscribed customer', () => {
    renderStep({ marketingPreference: true });

    expect(screen.getByText(CONSENT_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(CONSENT_NOTE_WITH_OPT_IN)).toBeNull();
  });

  it('drops the clause before an email is entered', () => {
    renderStep({ marketingPreference: null, email: '   ' });

    expect(screen.getByText(CONSENT_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(CONSENT_NOTE_WITH_OPT_IN)).toBeNull();
  });

  /**
   * The two variants share their opening sentence, so a substring matcher would
   * report the clause-free note as present inside the clause-bearing one. These
   * assertions rely on testing-library's default whole-string normalisation;
   * this case fails loudly if either string is ever made a prefix-only match.
   */
  it('states the booking-email consent in both states', () => {
    for (const preference of [true, null] as const) {
      const { unmount } = render(
        <NextIntlClientProvider locale="en" messages={messages as never}>
          <YourDetailsStep {...baseProps} marketingPreference={preference} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(/post-visit review email/)).toBeInTheDocument();
      unmount();
    }
  });
});
