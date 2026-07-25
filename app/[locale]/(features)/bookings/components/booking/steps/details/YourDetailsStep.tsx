'use client';

import { useTranslations } from 'next-intl';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { ProjectedCostBreakdown } from '@/components/booking/ProjectedCostBreakdown';
import type { CostBreakdown } from '@/lib/cost-calculator';
import { IdentityCard, isIdentityComplete } from './IdentityCard';

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
  customerNotes: string;
  setCustomerNotes: (value: string) => void;
  costBreakdown: CostBreakdown | null;
  costDataLoading: boolean;
  costLanguage: 'en' | 'th' | 'ja' | 'ko' | 'zh';
  isSubmitting: boolean;
  marketingOptIn: boolean;
  setMarketingOptIn: (value: boolean) => void;
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
 * information, customer notes, the projected cost breakdown and the marketing
 * opt-in with its consent note (a compliance artifact from PR #18; it must stay
 * on this sub-step, where the customer confirms).
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
 * (`firstIncompleteContactField`): the card shows exactly when none of the three
 * fields can be flagged. `contactFlagged` below is belt-and-braces for the
 * impossible case, so a flag would still yield the inputs rather than scroll to
 * a node that is not there.
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
  customerNotes,
  setCustomerNotes,
  costBreakdown,
  costDataLoading,
  costLanguage,
  isSubmitting,
  marketingOptIn,
  setMarketingOptIn,
  isEditingContact,
  onEditContact,
  alsoUpdateAccount,
  setAlsoUpdateAccount,
}: YourDetailsStepProps) {
  const t = useTranslations('bookings.detailsStep');

  const contactFlagged =
    errorField === 'bd-name' || errorField === 'bd-phone' || errorField === 'bd-email';
  const showIdentityCard =
    !isEditingContact && !contactFlagged && isIdentityComplete({ name, phoneNumber, email });

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

        <div className="space-y-4">
          {/* Name field */}
          <div id="bd-name" className="scroll-mt-24">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('name')}
            </label>
            <input
              type="text"
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
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorField === 'bd-email') setErrorField(null);
                }}
                className={`w-full h-12 px-4 rounded-lg focus:outline-none ${
                  errorField === 'bd-email'
                    ? 'border border-amber-500 bg-amber-50 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                    : !email
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
              <p className="mt-1 text-sm font-medium text-amber-600">{t('errorNeedEmail')}</p>
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

      {/* Projected Cost Breakdown. Mobile only: without `lg:hidden` desktop
          renders the full breakdown TWICE, this copy and the sticky SummaryRail's
          (which additionally splits the bay-rate portions out) about 300px to the
          right. Two copies of one total on one screen is worse than either alone
          — the same reason the sticky bar does not mount on desktop. */}
      {costBreakdown && (
        <div className="mt-4 lg:hidden">
          <ProjectedCostBreakdown
            breakdown={costBreakdown}
            isLoading={costDataLoading}
            language={costLanguage}
          />
        </div>
      )}

      {/* No Back button here. Backward navigation is the header arrow only (see
          `handleHeaderBack` in `useBookingFlow`): it steps back a sub-step, or
          leaves step 3 from the first one. The button that used to sit here
          called the very same `handleBack` as that arrow, so it was a duplicate
          rather than a second capability. */}

      {/* Marketing opt-in: only meaningful once an email is entered. */}
      {email.trim().length > 0 && (
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

      <p className="text-xs text-gray-400 text-center mt-3">
        {t('consentNote')}
      </p>
    </>
  );
}
