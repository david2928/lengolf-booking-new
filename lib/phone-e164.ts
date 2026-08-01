/**
 * Best-effort normalisation of a phone number to E.164.
 *
 * `react-phone-number-input` and `isValidPhoneNumber` only accept E.164, so a
 * number arriving in any other shape renders as invalid and the customer has to
 * retype a number that was already correct. Three sources feed it:
 *
 *  - the CRM record (`customers.contact_number`), stored in local Thai form
 *    like `0842695447`;
 *  - `profiles.phone_number`, same;
 *  - BROWSER AUTOFILL, which supplies whatever the customer saved in their
 *    contact card — usually local form, sometimes spaced or hyphenated.
 *
 * The last one is why this was extracted. The logic previously lived inline in
 * the VIP prefill path only, so autofilled numbers went in raw and were flagged
 * invalid, which undercuts the whole point of adding the `autocomplete` tokens.
 *
 * Deliberately conservative: it normalises the Thai cases we can be SURE about
 * and otherwise returns the input untouched, letting `PhoneInput` and its
 * validator have the final say. Guessing a country for an ambiguous number
 * would silently place a customer in the wrong one.
 */

/** Thailand. The only country we infer, because it is the only one we can. */
const TH_CALLING_CODE = '+66';

export function toE164(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;

  // Strip formatting the customer or their address book may have added:
  // spaces, hyphens, dots, and the brackets around a trunk code.
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (!cleaned) return undefined;

  // Already E.164, or at least already declaring its country. Leave it alone —
  // this function must never rewrite a number that names its own country.
  if (cleaned.startsWith('+')) return cleaned;

  // `0066…` — international prefix written the old way.
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;

  // Thai national format: 0 + 9 digits. The leading 0 is a trunk code and is
  // dropped, which is what makes this unambiguous.
  if (/^0\d{9}$/.test(cleaned)) return `${TH_CALLING_CODE}${cleaned.slice(1)}`;

  // Thai subscriber number with the trunk code already stripped.
  if (/^\d{9}$/.test(cleaned)) return `${TH_CALLING_CODE}${cleaned}`;

  // `66…` written without the plus. Guarded on the total length so a nine-digit
  // subscriber number beginning 66 is not mistaken for a country code.
  if (/^66\d{9}$/.test(cleaned)) return `+${cleaned}`;

  // Anything else: hand it back unchanged and let the phone input decide.
  // Returning a guess here is worse than returning nothing.
  return cleaned;
}
