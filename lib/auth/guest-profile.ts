/**
 * What a guest sign-in is allowed to write back to an existing guest profile.
 *
 * Guest sign-in resolves an existing profile on **email alone** — name and
 * phone are not part of the lookup. They are therefore unverified claims about
 * an identity the credentials provider has already decided to hand over. If
 * they were written straight through, anyone who knew an email address could
 * rewrite that person's stored name and phone number.
 *
 * The rule is the one the booking flow already applies to its own profile
 * write-back: filling a blank needs no consent, replacing a stored value does.
 * A guest sign-in is never the consent for the latter.
 *
 * Kept pure and dependency-free so the edges — null, empty string, whitespace —
 * can be pinned by tests without a database.
 */

export interface StoredGuestProfile {
  display_name?: string | null;
  phone_number?: string | null;
}

export interface GuestProfileUpdate {
  updated_at: string;
  display_name?: string;
  phone_number?: string;
  marketing_preference?: boolean;
}

/** Treats null, undefined and whitespace-only alike: there is nothing stored. */
export function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function buildGuestProfileUpdate(args: {
  stored: StoredGuestProfile;
  suppliedName: string;
  suppliedPhone: string;
  marketingOptIn: boolean;
  now: string;
}): GuestProfileUpdate {
  const { stored, suppliedName, suppliedPhone, marketingOptIn, now } = args;

  const update: GuestProfileUpdate = { updated_at: now };

  if (isBlank(stored.display_name)) {
    update.display_name = suppliedName;
  }
  if (isBlank(stored.phone_number)) {
    update.phone_number = suppliedPhone;
  }
  // Upgrade-only. Ticking the box re-affirms consent; unticking it never
  // silently revokes a prior opt-in — customers revoke via the preference
  // centre, deliberately.
  if (marketingOptIn) {
    update.marketing_preference = true;
  }

  return update;
}
