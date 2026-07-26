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
 *   `true`  → subscribed. Replace the checkbox with a confirmation.
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

const SUBSCRIBED_COPY = messages.bookings.detailsStep.marketingAlreadySubscribed;
const OPT_IN_LABEL = messages.bookings.detailsStep.marketingOptInLabel;

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
    peopleLabel: '2 people',
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
  it('hides the checkbox and confirms the subscription when already subscribed', () => {
    const { checkbox } = renderStep({ marketingPreference: true });
    expect(checkbox()).toBeNull();
    expect(screen.getByText(SUBSCRIBED_COPY)).toBeInTheDocument();
    // No stale "Send me..." invitation left behind next to the confirmation.
    expect(screen.queryByText(OPT_IN_LABEL)).toBeNull();
  });

  it('still shows the checkbox when the customer opted out (false)', () => {
    const { checkbox } = renderStep({ marketingPreference: false });
    expect(checkbox()).not.toBeNull();
    expect(screen.getByText(OPT_IN_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(SUBSCRIBED_COPY)).toBeNull();
  });

  it('still shows the checkbox when the preference has not loaded (null)', () => {
    const { checkbox } = renderStep({ marketingPreference: null });
    expect(checkbox()).not.toBeNull();
    expect(screen.getByText(OPT_IN_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(SUBSCRIBED_COPY)).toBeNull();
  });

  it('leaves the checkbox reflecting this booking, not the stored preference', () => {
    // `marketingPreference` is display-only. With a stored `false` and a
    // customer who has ticked the box for this booking, the box stays ticked —
    // the stored value must not be able to drive the control's state.
    const { checkbox } = renderStep({ marketingPreference: false, marketingOptIn: true });
    expect((checkbox() as HTMLInputElement).checked).toBe(true);
  });

  it('shows neither variant before an email is entered', () => {
    // The block has always been gated on a non-empty email; the subscribed
    // branch must not have quietly escaped that gate.
    const { checkbox } = renderStep({ marketingPreference: true, email: '   ' });
    expect(checkbox()).toBeNull();
    expect(screen.queryByText(SUBSCRIBED_COPY)).toBeNull();
  });
});
