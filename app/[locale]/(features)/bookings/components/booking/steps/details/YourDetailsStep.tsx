'use client';

import { useTranslations } from 'next-intl';
import { isValidEmail } from '@/lib/email-format';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { BookingReviewPanel } from './BookingReviewPanel';
import type { CostBreakdown } from '@/lib/cost-calculator';
import { IdentityCard, isIdentityComplete } from './IdentityCard';
import { ConsentNote } from './ConsentNote';
import { InFlowSignIn } from './InFlowSignIn';

/**
 * Whether the customer is already on the marketing list, and so should be shown
 * nothing at all rather than an unticked box claiming the opposite.
 *
 * Exported so the tri-state rule is pinned in one place and tested directly,
 * the same arrangement `IdentityCard` uses for its own visibility predicate.
 *
 * The `=== true` is the entire function and must stay strict. `false` is a
 * deliberate opt-out and `null` is unknown — not loaded yet, a guest, or no
 * linked customer record — and BOTH have to keep the checkbox. Only `true` is
 * evidence of consent; anything softer would let a slow `/api/vip/profile`
 * fetch quietly cost a willing customer their chance to opt in.
 */
export function isMarketingSubscribed(preference: boolean | null): boolean {
  return preference === true;
}

export interface YourDetailsStepProps {
  name: string;
  setName: (value: string) => void;
  phoneNumber: string | undefined;
  setPhoneNumber: (value: string | undefined) => void;
  email: string;
  setEmail: (value: string) => void;
  /** Which required field the sticky CTA flagged. Drives the amber state. */
  errorField: string | null;
  setErrorField: (value: string | null) => void;
  /** `errors.phoneNumber` — already translated inside the form hook. */
  phoneNumberError: string;
  /** `errors.email` — already translated inside the form hook. */
  emailError: string;
  isLineUser: boolean;
  /** Hides the in-flow sign-in row for customers who are already signed in. */
  isSignedIn: boolean;
  /** Locale-prefixed, query-free return path for the in-flow sign-in row. */
  signInCallbackUrl: string;
  customerNotes: string;
  setCustomerNotes: (value: string) => void;
  costBreakdown: CostBreakdown | null;
  costDataLoading: boolean;
  costLanguage: 'en' | 'th' | 'ja' | 'ko' | 'zh';
  isSubmitting: boolean;
  marketingOptIn: boolean;
  setMarketingOptIn: (value: boolean) => void;
  /**
   * The customer's EXISTING marketing consent, from `/api/vip/profile`.
   * Display only; it never reaches the payload.
   *
   * ONLY `true` counts as subscribed and suppresses the block outright — no
   * checkbox, and no line in its place. `false` is a deliberate opt-out and `null` is
   * not-yet-loaded / guest / no linked customer — both keep the checkbox,
   * because a customer must never lose the chance to opt in to a slow fetch.
   * See the tri-state note on `marketingPreference` in `useBookingDetailsForm`.
   */
  marketingPreference: boolean | null;
  /**
   * True once the customer has typed into ANY of the three contact fields.
   *
   * Suppresses the identity card for the lifetime of this mount — not "the
   * session", which in this flow also names a differently-scoped sessionStorage
   * snapshot. Leaving step 3 unmounts `BookingDetails` and the three values die
   * with it, so resetting alongside them is consistent.
   *
   * The card is a recap of details PREFILL supplied; completeness the customer
   * just typed is not something to recap back at them, and swapping the inputs
   * out mid-edit destroys the field under their cursor — see the gate below.
   *
   * One acknowledged seam: leaving to sign in and coming back restores the typed
   * values through `takeContactDraft`, which uses the RAW setters, so this is
   * false on the remount and the card can recap details the customer typed
   * themselves. That is harmless — nothing is in flight and Change is right
   * there — and it is the better outcome than re-presenting three full inputs.
   */
  contactTouched: boolean;
  /** True once the customer tapped Change on the identity card. Reveals the
      three inputs and the "also update my account" opt-in. */
  isEditingContact: boolean;
  /** Sets `isEditingContact`. Wired to the card's Change button. */
  onEditContact: () => void;
  /** Opt-in that lets the submit write the edited values back to `profiles`.
      Unchecked by default: edits apply to this booking only. */
  alsoUpdateAccount: boolean;
  setAlsoUpdateAccount: (value: boolean) => void;
}

/**
 * Your-details section of booking step 3 — the last mobile sub-step: contact
 * information, customer notes, the projected cost breakdown, the marketing
 * opt-in, and last of all the mobile copy of the consent disclosure (a
 * compliance artifact from PR #18). The disclosure must stay on this sub-step,
 * which is where the customer confirms — see `ConsentNote`.
 * Renders as a fragment so the parent `<form>`'s `space-y-4 sm:space-y-6` keeps
 * applying to these blocks as direct children.
 *
 * The `bd-name` / `bd-phone` / `bd-email` ids and their `scroll-mt-24` classes
 * are load-bearing: `firstInvalidField` in `useBookingDetailsForm` locates these
 * fields with `document.getElementById`. Renaming or dropping one silently
 * breaks jump-to-error with no type error.
 *
 * For a returning customer whose profile supplied all three values, the inputs
 * are replaced by a read-only `IdentityCard` — so those ids are then absent from
 * the DOM. That is safe because the card and jump-to-error share one predicate
 * (`firstIncompleteContactField`): the card shows only when none of the three
 * fields can be flagged. Only when, not exactly when — the gate carries further
 * conjuncts, so the card may decline to show while the predicate is satisfied.
 * That direction only leaves more fields in the DOM, so the `getElementById`
 * invariant is strengthened rather than weakened. `contactFlagged` below is not
 * merely belt-and-braces: it is a live second route into the mid-edit unmount,
 * because the inputs clear the flag as the customer types.
 */
export function YourDetailsStep({
  name,
  setName,
  phoneNumber,
  setPhoneNumber,
  email,
  setEmail,
  errorField,
  setErrorField,
  phoneNumberError,
  emailError,
  isLineUser,
  isSignedIn,
  signInCallbackUrl,
  customerNotes,
  setCustomerNotes,
  costBreakdown,
  costDataLoading,
  costLanguage,
  isSubmitting,
  marketingOptIn,
  setMarketingOptIn,
  marketingPreference,
  contactTouched,
  isEditingContact,
  onEditContact,
  alsoUpdateAccount,
  setAlsoUpdateAccount,
}: YourDetailsStepProps) {
  const t = useTranslations('bookings.detailsStep');

  const contactFlagged =
    errorField === 'bd-name' || errorField === 'bd-phone' || errorField === 'bd-email';
  /* `!contactTouched` is load-bearing, not a nicety. This expression is
     evaluated on EVERY render, including the one caused by a single keystroke,
     and flipping it to true UNMOUNTS the input the customer is typing into.
     Because email is last in reading order, the flip always landed on an email
     keystroke: the field was destroyed under the cursor, focus fell to <body>,
     and every remaining character was discarded — so whatever prefix happened
     to satisfy the predicate is what got submitted. That is how bookings were
     created with the email `r` (BK260803FKLR and six others, 2026-08-03 to
     08-06).

     The window opened with PR #122, and the reason is merge topology rather than
     behaviour: the card (c2c624f, dated 2026-07-25) sat on `feat/booking-ux-overhaul`
     and is an ANCESTOR of a32fe1e, so it and the login-wall removal reached
     production together on 08-02. There was never a period with the card live
     behind the wall. Do not infer one from the commit date — that reading came up
     in review, and the DB agrees with the topology: the first malformed email is
     08-03, the day after.

     `contactFlagged` is the second way in, not merely a third safety belt. All
     three inputs clear the flag as you type (`setErrorField(null)` below), so for
     a customer whose identity was otherwise complete, clearing it re-showed the
     card mid-keystroke — same unmount, different trigger. `!contactTouched`
     closes that route too, which is why it leads rather than follows.

     Gating on prefill rather than on the values themselves is also what the card
     is FOR — a recap of details the customer never had to supply. Someone who
     just typed all three has nothing to be reminded of. */
  const showIdentityCard =
    !contactTouched &&
    !isEditingContact &&
    !contactFlagged &&
    isIdentityComplete({ name, phoneNumber, email });
  /* Gates the marketing checkbox only. It used to gate a second variant of the
     consent note as well — the note carried a "see the opt-in above" clause
     that had to disappear whenever the box did. That clause is gone (it
     explained the form rather than the booking, and the box's own description
     already says unsubscribing lives in every email), so the note is now one
     unconditional sentence and this flag has one job. */
  const showMarketingOptIn =
    email.trim().length > 0 && !isMarketingSubscribed(marketingPreference);

  return (
    <>
      {/* Contact Information Section */}
      <div className="pt-4 border-t border-gray-200">
        {showIdentityCard ? (
          <IdentityCard
            name={name}
            phoneNumber={phoneNumber}
            email={email}
            onChange={onEditContact}
          />
        ) : (
        <>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('contactInformation')}</h3>

        {/* Sign-in as a shortcut, above the fields it saves the customer
            filling in. Hidden once they are signed in — there is nothing left
            to offer — and hidden behind the IdentityCard branch above, because
            a customer whose PREFILLED details are already complete has nothing
            to gain either. Note a guest who typed all three keeps this row now
            that `contactTouched` suppresses the card: they are not signed in, so
            the offer is still live and still saves them the typing next time. */}
        {!isSignedIn && (
          <div className="mb-4">
            <InFlowSignIn
              name={name}
              email={email}
              phoneNumber={phoneNumber}
              callbackUrl={signInCallbackUrl}
            />
          </div>
        )}

        <div className="space-y-4">
          {/* Name field */}
          <div id="bd-name" className="scroll-mt-24">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('name')}
            </label>
            {/* autoComplete is the cheapest prefill we have and the only one
                that works on a customer's FIRST visit, cross-site, without us
                storing anything. Without these tokens browsers fall back to
                guessing from field names, which is unreliable for name and
                phone, and iOS Contacts autofill and password managers largely
                ignore fields that lack them. */}
            <input
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorField === 'bd-name') setErrorField(null);
              }}
              className={`w-full h-12 px-4 rounded-lg focus:outline-none ${
                errorField === 'bd-name'
                  ? 'border-amber-500 bg-amber-50'
                  : `bg-gray-50 ${!name ? 'border-red-100' : 'border-green-500'}`
              } border focus:border-green-500 focus:ring-1 focus:ring-green-500`}
              placeholder={t('namePlaceholder')}
            />
            {errorField === 'bd-name' && (
              <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedName')}</p>
            )}
          </div>

          {/* Phone Number */}
          <div id="bd-phone" className="scroll-mt-24">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('phoneNumber')}
            </label>
            <div className="relative">
              <PhoneInput
                international
                defaultCountry="TH"
                placeholder={t('phoneNumberPlaceholder')}
                /* Forwarded to the underlying <input>. Note an autofilled value
                   usually arrives in local format (0842695447), which
                   `isValidPhoneNumber` rejects — PhoneInput will show it as
                   invalid until the customer corrects it. Normalising autofilled
                   input to E.164 is tracked with the wider phone-normalisation
                   cleanup; the token still earns its place meanwhile, because a
                   near-right number to correct beats an empty field. */
                name="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(value) => {
                  setPhoneNumber(value);
                  if (errorField === 'bd-phone') setErrorField(null);
                }}
                className={`w-full h-12 px-3 py-2 rounded-lg focus:outline-none border focus:border-green-500 focus:ring-1 focus:ring-green-500 custom-phone-input ${
                  errorField === 'bd-phone'
                    ? 'border-amber-500 bg-amber-50'
                    : `bg-gray-50 ${
                        phoneNumberError
                          ? 'border-red-500'
                          : (phoneNumber && isValidPhoneNumber(phoneNumber || ''))
                          ? 'border-green-500'
                          : 'border-gray-200'
                      }`
                }`}
              />
            </div>
            {/* Helper text to guide country selection if number is empty */}
            {!phoneNumber && (
              <p className="mt-1 text-xs text-gray-500">
                {t('phoneCountryHelper')}
              </p>
            )}
            {errorField === 'bd-phone' && (
              <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedPhone')}</p>
            )}
            {phoneNumberError && (
              <p className="mt-1 text-sm text-red-600">{phoneNumberError}</p>
            )}
          </div>

          {/* Email */}
          <div id="bd-email" className="scroll-mt-24">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('emailAddress')}
            </label>
            <div className="relative">
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorField === 'bd-email') setErrorField(null);
                }}
                className={`w-full h-12 px-4 rounded-lg focus:outline-none ${
                  errorField === 'bd-email'
                    ? 'border border-amber-500 bg-amber-50 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                    : // Green is a claim that the field is DONE, so it has to
                      // mean valid, not merely non-empty. `r` used to render
                      // green — the strongest possible signal to press Confirm.
                      !isValidEmail(email)
                    ? 'bg-gray-50 border border-red-100 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                    : 'bg-gray-50 border border-green-500'
                }`}
                placeholder={isLineUser ? t('emailPlaceholderLine') : t('emailPlaceholderDefault')}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t('emailConfirmationNote')}
            </p>
            {errorField === 'bd-email' && (
              // "We need an email" in front of a filled-in field reads as a
              // broken form and gets the same value retyped. The flag fires for
              // empty AND malformed now, so it has to say which.
              <p className="mt-1 text-sm font-medium text-amber-600">
                {email.trim() ? t('errorEmailLooksWrong') : t('errorNeedEmail')}
              </p>
            )}
            {emailError && (
              <p className="mt-1 text-sm text-red-600">{emailError}</p>
            )}
          </div>
        </div>

        {/* Scope of the edit. Unchecked means this booking records the new
            values and the saved account keeps its own — owner-confirmed
            2026-07-25. Only offered once the customer chose to edit; when the
            fields are shown because the profile never had all three, there is
            no card to have edited away from. */}
        {isEditingContact && (
          <label
            htmlFor="booking-also-update-account"
            className="mt-4 flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 cursor-pointer"
          >
            <input
              id="booking-also-update-account"
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#005a32]"
              checked={alsoUpdateAccount}
              onChange={(e) => setAlsoUpdateAccount(e.target.checked)}
              disabled={isSubmitting}
            />
            <span className="text-sm text-gray-800">
              <span className="font-medium block">{t('alsoUpdateAccount')}</span>
              <span className="text-gray-600">{t('alsoUpdateAccountHint')}</span>
            </span>
          </label>
        )}
        </>
        )}
      </div>

      {/* Add Customer Notes/Special Requests field */}
      <div>
        <label htmlFor="customerNotes" className="block text-sm font-medium text-gray-700 mb-1">
          {t('notesLabel')}
        </label>
        <textarea
          id="customerNotes"
          value={customerNotes}
          onChange={(e) => setCustomerNotes(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none text-sm sm:text-base"
          placeholder={t('notesPlaceholder')}
        />
        <p className="mt-1 text-xs sm:text-sm text-gray-500">
          {t('notesHelper')}
        </p>
      </div>

      {/* Review panel: the booking's facts followed by the projected cost
          breakdown, immediately before the confirm action. Mobile only, and it
          owns the `lg:hidden` itself — without that, desktop renders the full
          breakdown TWICE, this copy and the sticky SummaryRail's (which
          additionally splits the bay-rate portions out) about 300px to the
          right. Two copies of one total on one screen is worse than either
          alone, the same reason the sticky bar does not mount on desktop.

          This is the SAME breakdown that used to render bare here, now with the
          date, start time, duration, bay and party size above it — so the panel
          adds the facts without adding a second total. */}
      <BookingReviewPanel
        costBreakdown={costBreakdown}
        costDataLoading={costDataLoading}
        costLanguage={costLanguage}
      />

      {/* No Back button here. Backward navigation is the header arrow only (see
          `handleHeaderBack` in `useBookingFlow`): it steps back a sub-step, or
          leaves step 3 from the first one. The button that used to sit here
          called the very same `handleBack` as that arrow, so it was a duplicate
          rather than a second capability. */}

      {/* Marketing opt-in: only meaningful once an email is entered, and only
          for someone who is not already on the list.

          An already-subscribed customer gets NOTHING here, not a confirmation
          line in place of the box — owner-confirmed. There is no decision to
          make, so anything rendered is a block of copy between the customer and
          the confirm button telling them a fact they did not ask about, in the
          middle of a checkout. Unsubscribing lives in every email, which is
          where a customer already looks for it.

          `alreadySubscribed` is a STRICT `=== true`, deliberately, not a truthy
          check. `marketingPreference` is tri-state and only `true` means
          subscribed: `false` is a deliberate opt-out and `null` is
          not-yet-loaded / guest / no linked customer, and both of those must
          still get the checkbox. The failure this guards against is one-way and
          silent — a customer who would have opted in never sees the box because
          a profile fetch had not landed yet. */}
      {showMarketingOptIn && (
        <label
          htmlFor="booking-marketing-opt-in"
          className="mt-4 flex items-start gap-3 p-3 rounded-md cursor-pointer"
          style={{
            backgroundColor: 'rgba(0, 90, 50, 0.08)',
            border: '1px solid rgba(0, 90, 50, 0.4)',
          }}
        >
          <input
            id="booking-marketing-opt-in"
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[#005a32]"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            disabled={isSubmitting}
          />
          <span className="text-sm text-gray-800">
            <span className="font-medium block">{t('marketingOptInLabel')}</span>
            <span className="text-gray-600">{t('marketingOptInDescription')}</span>
          </span>
        </label>
      )}

      {/* The consent disclosure, and deliberately the LAST thing in this
          component. It no longer sits at the bottom of a form section: it
          opens "By booking, you agree", so it belongs against the control
          that does the booking. This is the MOBILE half of that pair
          (`lg:hidden`); the desktop half is under the `SummaryRail`'s Confirm
          button, in an aside classed `hidden lg:block`. Exact complements of
          one breakpoint, so exactly one renders at any width. Being last here
          puts it immediately above the fixed `BookingSummaryBar`, which is as
          close to "under" a fixed element as document flow gets.

          It stays inside THIS component precisely because this component only
          renders on the `contact` sub-step, so the note inherits "last
          sub-step only" and can never attach to the bar while its CTA still
          reads "Continue". See `ConsentNote` for why no prop removes it, why
          the marketing clause was dropped, and for the contrast floor. */}
      <ConsentNote className="mt-3 lg:hidden" />
    </>
  );
}
