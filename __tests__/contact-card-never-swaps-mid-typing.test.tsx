/**
 * The identity card must never replace an input the customer is typing into.
 *
 * `showIdentityCard` in `YourDetailsStep` is re-evaluated on EVERY render,
 * including the one a single keystroke causes. Gating it on the field VALUES
 * alone means the card can flip to visible mid-word — and because it renders
 * instead of the three inputs, that UNMOUNTS the field under the cursor. Focus
 * falls to `<body>` and every remaining keystroke is discarded, so whatever
 * prefix happened to satisfy the predicate is what gets submitted.
 *
 * Email is last in reading order, so the flip always landed on an email
 * keystroke. Live damage: seven bookings between 2026-08-03 and 2026-08-06 were
 * created with a one-character email (BK260803FKLR and others stored `r`, the
 * customer's real address being radicalman@netvigator.com). The window opened
 * with PR #122 — before it, the login wall meant every customer arrived
 * prefilled, so the card rendered on mount and the transition never happened
 * while anyone was typing.
 *
 * PR #130 tightened the predicate from "email non-empty" to `isValidEmail`,
 * which did NOT close this: it only moved the truncation point to the first
 * prefix that parses. `radicalman@netvigator.c` is accepted by the regex (a
 * one-character TLD passes), so the card still snapped shut four characters
 * early — and that value clears every validation gate, so it reaches SMTP and
 * `customers.email` looking legitimate. The first case was loud; that one is
 * silent. Hence this test types a FULL address one character at a time and
 * asserts the field survives intact, rather than asserting anything about the
 * predicate.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import {
  YourDetailsStep,
  type YourDetailsStepProps,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/YourDetailsStep';
import messages from '@/messages/en.json';

/**
 * A guest arriving at step 3 with nothing prefilled — the state PR #122 made
 * reachable, and the only one in which the customer types all three fields.
 */
function Harness({ initial = {} }: { initial?: Partial<YourDetailsStepProps> }) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState('');
  // Mirrors `useBookingDetailsForm`: only the customer-facing setters latch it,
  // so prefill (which uses the raw setters) leaves it false.
  const [contactTouched, setContactTouched] = useState(false);

  const props: YourDetailsStepProps = {
    name,
    setName: (v) => { setContactTouched(true); setName(v); },
    phoneNumber,
    setPhoneNumber: (v) => { setContactTouched(true); setPhoneNumber(v); },
    email,
    setEmail: (v) => { setContactTouched(true); setEmail(v); },
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
    contactTouched,
    isEditingContact: false,
    onEditContact: () => {},
    alsoUpdateAccount: false,
    setAlsoUpdateAccount: () => {},
    ...initial,
  };

  return (
    <NextIntlClientProvider locale="en" messages={messages as never}>
      <YourDetailsStep {...props} />
    </NextIntlClientProvider>
  );
}

const emailField = () => document.querySelector('#bd-email input') as HTMLInputElement | null;

describe('the contact inputs survive being typed into', () => {
  /**
   * The regression itself. `userEvent.type` dispatches one keystroke at a time
   * against whatever is in the DOM, so if the input unmounts partway the
   * remaining characters land nowhere — exactly as in the browser.
   */
  it('keeps the whole email address when it is typed character by character', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText(messages.bookings.detailsStep.namePlaceholder), 'Rowan McKenzie');
    await user.type(document.querySelector('#bd-phone input') as HTMLInputElement, '842695447');

    const field = emailField();
    expect(field).not.toBeNull();
    await user.type(field!, 'radicalman@netvigator.com');

    // Before the fix this was `radicalman@netvigator.c` (post-PR#130) or `r`
    // (pre-PR#130), because the field stopped existing mid-word.
    expect(emailField()).not.toBeNull();
    expect(emailField()!.value).toBe('radicalman@netvigator.com');
  });

  it('does not swap the inputs out at the moment the address first parses', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText(messages.bookings.detailsStep.namePlaceholder), 'Tyler Takechi');
    await user.type(document.querySelector('#bd-phone input') as HTMLInputElement, '842695447');
    await user.type(emailField()!, 'twylerlp@gmail.c');

    // `twylerlp@gmail.c` satisfies isValidEmail — a one-character TLD passes the
    // regex — so this is the precise keystroke that used to destroy the field.
    expect(emailField()).not.toBeNull();
    await user.type(emailField()!, 'om');
    expect(emailField()!.value).toBe('twylerlp@gmail.com');
  });

  /**
   * The card still has to do its job. It exists so a RETURNING customer is not
   * shown three inputs full of details they never supplied, and gating on
   * "has the customer typed" must not take that away.
   */
  it('still shows the card for a prefilled customer who has typed nothing', () => {
    render(
      <Harness
        initial={{
          name: 'David Geiermann',
          phoneNumber: '+66812345678',
          email: 'david@example.com',
          contactTouched: false,
        }}
      />,
    );

    expect(screen.getByText(messages.bookings.detailsStep.bookingAsLabel)).toBeInTheDocument();
    expect(document.getElementById('bd-email')).toBeNull();
  });
});
