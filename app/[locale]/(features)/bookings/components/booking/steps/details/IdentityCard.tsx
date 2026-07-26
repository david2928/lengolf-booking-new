'use client';

import { useTranslations } from 'next-intl';
import { formatPhoneNumberIntl, isValidPhoneNumber } from 'react-phone-number-input';

/** The three contact values the card stands in for. */
export interface ContactIdentity {
  name: string;
  phoneNumber: string | undefined;
  email: string;
}

/** The `bd-*` anchor ids of the three contact fields, in reading order. */
export type ContactFieldId = 'bd-name' | 'bd-phone' | 'bd-email';

/**
 * The id of the first incomplete contact field, or `null` when all three are
 * good. Reading order, which is also the order the customer fills them in.
 *
 * **This is the single source of truth for contact completeness.** Both
 * `firstInvalidField` in `useBookingDetailsForm` (which drives jump-to-error)
 * and `isIdentityComplete` below (which decides whether the card replaces the
 * inputs) call it, so the two cannot drift apart. That matters: the inputs are
 * absent from the DOM while the card is showing, and `flagAndRevealField`
 * locates them with `document.getElementById`. Because the card shows exactly
 * when this returns `null`, a flag can never target a field the card is hiding.
 */
export function firstIncompleteContactField({
  name,
  phoneNumber,
  email,
}: ContactIdentity): ContactFieldId | null {
  if (!name.trim()) return 'bd-name';
  if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) return 'bd-phone';
  if (!email.trim()) return 'bd-email';
  return null;
}

/**
 * Whether the read-only identity card can stand in for the three inputs.
 *
 * A blank line in the card is worse than a plain empty input, and partial
 * prefill is common — LINE users frequently have no email on file — so the card
 * is all-or-nothing. An invalid stored phone counts as missing: the card would
 * otherwise present a number the customer cannot book with as settled fact.
 */
export function isIdentityComplete(contact: ContactIdentity): boolean {
  return firstIncompleteContactField(contact) === null;
}

/**
 * Up to two initials for the avatar. Word-based rather than character-based so
 * it behaves for scripts without capitalisation (Thai, Japanese) as well as for
 * Latin names.
 */
export function contactInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * `+66842695447` → `+66 84 269 5447`. **Display only** — the E.164 value the
 * card was handed is what gets submitted and written back to the profile, and
 * nothing downstream reads this string.
 *
 * International rather than national format because customers book from
 * several countries and the card must never present a Thai-looking `084 269
 * 5447` for a number that is not Thai.
 *
 * `formatPhoneNumberIntl` returns `''` for anything it cannot parse, so fall
 * back to the raw value: a blank line where a phone number belongs is worse
 * than an unformatted one. The card only renders once `isValidPhoneNumber`
 * passes, so this should be unreachable — it is here because the cost of being
 * wrong about that is an empty line in the customer's own contact details.
 */
export function formatPhoneForDisplay(phoneNumber: string): string {
  return formatPhoneNumberIntl(phoneNumber) || phoneNumber;
}

export interface IdentityCardProps extends ContactIdentity {
  /** Reveals the three inputs. Wired to `setIsEditingContact(true)`. */
  onChange: () => void;
}

/**
 * Read-only recap of a returning customer's contact details, in place of three
 * full-height inputs holding values they never had to supply.
 *
 * Renders `null` unless all of name, phone and email are present and the phone
 * is valid — see `isIdentityComplete`. The caller checks the same predicate to
 * decide whether to render the inputs instead, so exactly one of the two is on
 * screen.
 *
 * `type="button"` on Change is load-bearing: this renders inside the booking
 * `<form>`, where a button with no explicit type defaults to `submit` and would
 * fire the booking.
 */
export function IdentityCard({ name, phoneNumber, email, onChange }: IdentityCardProps) {
  const t = useTranslations('bookings.detailsStep');

  if (!isIdentityComplete({ name, phoneNumber, email })) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('bookingAsLabel')}</h3>
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-800"
        >
          {contactInitials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
          <p className="truncate text-xs text-gray-600">
            {formatPhoneForDisplay(phoneNumber!)}
          </p>
          <p className="truncate text-xs text-gray-600">{email}</p>
        </div>
        <button
          type="button"
          onClick={onChange}
          className="flex-shrink-0 text-sm font-medium text-green-600 underline hover:text-green-700"
        >
          {t('changeContact')}
        </button>
      </div>
    </div>
  );
}
