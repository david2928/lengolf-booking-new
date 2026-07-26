/**
 * Read-only contact identity card for booking step 3.
 *
 * Two contracts matter here.
 *
 * 1. **All or nothing.** The card only stands in for the three contact inputs
 *    when name, phone and email are all present AND the phone is valid. Partial
 *    prefill is common — LINE users frequently have no email on file — and a
 *    card with a blank line reads worse than a plain empty input. An invalid
 *    stored phone counts as missing, because the card would otherwise present a
 *    number the customer cannot book with as settled fact.
 *
 * 2. **It cannot hide a flaggable field.** While the card shows, `bd-name` /
 *    `bd-phone` / `bd-email` are absent from the DOM, and `flagAndRevealField`
 *    finds them with `document.getElementById`. That is safe only because the
 *    card's visibility predicate and jump-to-error's field check are the SAME
 *    function — `firstIncompleteContactField`. The card shows exactly when that
 *    returns null, i.e. exactly when none of the three can be flagged. The
 *    tests below pin that equivalence so a future edit to one cannot drift from
 *    the other.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import {
  IdentityCard,
  contactInitials,
  firstIncompleteContactField,
  formatPhoneForDisplay,
  isIdentityComplete,
  type ContactIdentity,
} from '@/app/[locale]/(features)/bookings/components/booking/steps/details/IdentityCard';
import messages from '@/messages/en.json';

/** A returning customer with a complete, valid profile. */
const COMPLETE: ContactIdentity = {
  name: 'David Geiermann',
  phoneNumber: '+66812345678',
  email: 'david@example.com',
};

function renderCard(props: Partial<ContactIdentity> = {}) {
  const onChange = jest.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <IdentityCard {...COMPLETE} {...props} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

describe('IdentityCard', () => {
  test('renders name, phone, email and initials when all three are present and the phone is valid', () => {
    renderCard();

    expect(screen.getByText('David Geiermann')).toBeInTheDocument();
    // Grouped for reading, not the raw E.164 digit run the profile stores.
    expect(screen.getByText('+66 81 234 5678')).toBeInTheDocument();
    expect(screen.queryByText('+66812345678')).not.toBeInTheDocument();
    expect(screen.getByText('david@example.com')).toBeInTheDocument();
    expect(screen.getByText('DG')).toBeInTheDocument();
    expect(screen.getByText('Booking as')).toBeInTheDocument();
  });

  // Customers book from several countries, so the card must not present a
  // foreign number in Thai national format.
  test('a non-Thai number keeps its own country grouping', () => {
    renderCard({ phoneNumber: '+4915112345678' });
    expect(screen.getByText('+49 1511 2345678')).toBeInTheDocument();
  });

  // Each of these must render nothing at all, because the caller reads the same
  // predicate to decide it should show the three inputs instead. Rendering a
  // partial card would put both on screen.
  const incomplete: Array<[string, Partial<ContactIdentity>]> = [
    ['name is blank', { name: '' }],
    ['name is only whitespace', { name: '   ' }],
    ['email is blank', { email: '' }],
    ['email is only whitespace', { email: '  ' }],
    ['phone is undefined', { phoneNumber: undefined }],
    ['phone is blank', { phoneNumber: '' }],
    ['phone is present but not a valid number', { phoneNumber: '+6612' }],
  ];

  test.each(incomplete)('renders nothing when %s', (_label, override) => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <IdentityCard {...COMPLETE} {...override} onChange={() => {}} />
      </NextIntlClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });

  test('Change fires its callback', async () => {
    const { onChange } = renderCard();
    const button = screen.getByRole('button', { name: 'Change' });

    await userEvent.click(button);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // The card sits inside the booking `<form>`. A button with no explicit type
  // defaults to submit, which would fire the booking instead of revealing the
  // fields.
  test('Change is type="button" so it cannot submit the booking form', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Change' })).toHaveAttribute('type', 'button');
  });
});

describe('firstIncompleteContactField', () => {
  test('returns null for a complete, valid identity', () => {
    expect(firstIncompleteContactField(COMPLETE)).toBeNull();
    expect(isIdentityComplete(COMPLETE)).toBe(true);
  });

  // Reading order, which is the order the customer fills the form in — and the
  // order `firstInvalidField` used before it delegated here.
  test('reports fields in reading order', () => {
    expect(
      firstIncompleteContactField({ name: '', phoneNumber: undefined, email: '' }),
    ).toBe('bd-name');
    expect(
      firstIncompleteContactField({ ...COMPLETE, phoneNumber: undefined, email: '' }),
    ).toBe('bd-phone');
    expect(firstIncompleteContactField({ ...COMPLETE, email: '' })).toBe('bd-email');
  });

  test('an invalid phone is reported as bd-phone, not accepted', () => {
    expect(firstIncompleteContactField({ ...COMPLETE, phoneNumber: '+6612' })).toBe('bd-phone');
  });

  // The equivalence that makes hiding the inputs safe.
  test.each([
    ['', '+66812345678', 'a@b.com'],
    ['David', undefined, 'a@b.com'],
    ['David', '+6612', 'a@b.com'],
    ['David', '+66812345678', ''],
    ['David', '+66812345678', 'a@b.com'],
  ] as Array<[string, string | undefined, string]>)(
    'the card shows iff no contact field can be flagged (%s / %s / %s)',
    (name, phoneNumber, email) => {
      const contact = { name, phoneNumber, email };
      expect(isIdentityComplete(contact)).toBe(firstIncompleteContactField(contact) === null);
    },
  );
});

describe('formatPhoneForDisplay', () => {
  test('groups an E.164 number in international format', () => {
    expect(formatPhoneForDisplay('+66842695447')).toBe('+66 84 269 5447');
    expect(formatPhoneForDisplay('+66812345678')).toBe('+66 81 234 5678');
  });

  // `formatPhoneNumberIntl` returns '' for anything it cannot parse. The card
  // is gated on `isValidPhoneNumber` so this should be unreachable, but a blank
  // line where the customer's own phone number belongs is the one outcome that
  // must not be possible.
  test.each(['not-a-number', '0842695447', '   '])(
    'falls back to the raw value rather than rendering nothing (%s)',
    (raw) => {
      expect(formatPhoneForDisplay(raw)).toBe(raw);
    },
  );

  // A too-short-but-parseable number still formats ("+6612" → "+66 12"). It
  // cannot reach the card (`isValidPhoneNumber` rejects it) and the point of
  // the case is only that it does not vanish.
  test('never returns an empty string for a non-empty input', () => {
    for (const raw of ['not-a-number', '+6612', '0842695447', '+66842695447']) {
      expect(formatPhoneForDisplay(raw)).not.toBe('');
    }
  });

  test('is display-only — it never rewrites the value it was given', () => {
    const stored = '+66842695447';
    expect(formatPhoneForDisplay(stored)).not.toBe(stored);
    expect(stored).toBe('+66842695447');
  });
});

describe('contactInitials', () => {
  test('takes the first letter of the first two words', () => {
    expect(contactInitials('David Geiermann')).toBe('DG');
    expect(contactInitials('Mary Jane Watson')).toBe('MJ');
  });

  test('falls back to one initial for a single-word name', () => {
    expect(contactInitials('Prim')).toBe('P');
  });

  test('tolerates extra whitespace', () => {
    expect(contactInitials('  david   geiermann  ')).toBe('DG');
  });

  // Scripts without capitalisation must still yield a glyph rather than an
  // empty avatar.
  test('works for a Thai name', () => {
    expect(contactInitials('ชนิกา ใจดี')).toBe('ชใ');
  });
});
