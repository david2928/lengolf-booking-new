import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import { InFlowSignIn } from '@/app/[locale]/(features)/bookings/components/booking/steps/details/InFlowSignIn';

const signInMock = jest.fn();
jest.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

/**
 * The invariant that must hold for the in-flow sign-in row to be safe to ship.
 *
 * OAuth is a full-document navigation, so tapping a provider destroys whatever
 * the customer has typed unless it is persisted first. The unit tests for
 * `contactDraft` prove the storage helper works; this proves the BUTTON is
 * actually wired to it, which is the part that silently breaks when props are
 * rethreaded.
 */
function renderRow(props: Partial<React.ComponentProps<typeof InFlowSignIn>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages as never}>
      <InFlowSignIn
        name="Somchai Preecha"
        email="somchai@example.com"
        phoneNumber="+66842695447"
        callbackUrl="/th/bookings"
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe('InFlowSignIn', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    signInMock.mockReset();
  });

  it('offers all three providers under the shortcut framing', () => {
    renderRow();
    expect(screen.getByText(messages.bookings.detailsStep.signInPromptTitle)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Facebook/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with LINE/i })).toBeInTheDocument();
  });

  // The copy must promise only what a FIRST-TIME customer actually receives.
  // Google gives name and email but no phone; LINE and Facebook usually only a
  // name. "We'll fill this in for you" would be a promise we cannot keep.
  it('does not promise to fill the form in', () => {
    renderRow();
    const body = messages.bookings.detailsStep.signInPromptBody;
    expect(body).not.toMatch(/fill (this|it) in for you/i);
  });

  it.each([
    ['Google', 'google'],
    ['Facebook', 'facebook'],
    ['LINE', 'line'],
  ])('persists the typed contact details before leaving for %s', (label, provider) => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Continue with ${label}`, 'i') }));

    const raw = window.sessionStorage.getItem('lengolf.bayBookingContact');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      name: 'Somchai Preecha',
      email: 'somchai@example.com',
      phoneNumber: '+66842695447',
    });

    expect(signInMock).toHaveBeenCalledWith(provider, { callbackUrl: '/th/bookings' });
  });

  // Ordering matters: the write has to happen BEFORE signIn kicks off the
  // redirect, and synchronously. If it were awaited or deferred it would race
  // the navigation and land only sometimes.
  it('writes the draft before calling signIn, not after', () => {
    let storageAtSignIn: string | null = 'not-called';
    signInMock.mockImplementation(() => {
      storageAtSignIn = window.sessionStorage.getItem('lengolf.bayBookingContact');
    });

    renderRow();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));

    expect(storageAtSignIn).not.toBeNull();
    expect(storageAtSignIn).not.toBe('not-called');
    expect(JSON.parse(storageAtSignIn as string).name).toBe('Somchai Preecha');
  });

  // An empty form should not leave a husk behind that a later read would treat
  // as a real draft and use to blank out prefilled fields.
  it('stores nothing when the customer has typed nothing yet', () => {
    renderRow({ name: '', email: '', phoneNumber: undefined });
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));
    expect(window.sessionStorage.getItem('lengolf.bayBookingContact')).toBeNull();
    expect(signInMock).toHaveBeenCalled();
  });

  it('carries the locale-prefixed callbackUrl through unchanged, and query-free', () => {
    renderRow({ callbackUrl: '/ko/bookings' });
    fireEvent.click(screen.getByRole('button', { name: /Continue with LINE/i }));
    const url = signInMock.mock.calls[0][1].callbackUrl;
    expect(url).toBe('/ko/bookings');
    expect(url).not.toContain('?');
  });
});
