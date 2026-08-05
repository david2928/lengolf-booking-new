/**
 * Identifier normalisation + hashing for the Meta Conversions API.
 *
 * Pure by design — no env reads, no network, no Supabase. Everything here is
 * unit-testable, which matters because a mistake in this file is invisible in
 * production: Meta accepts a wrong hash exactly as happily as a right one and
 * simply never matches it.
 */
import { parsePhoneNumberFromString, type PhoneNumber } from 'libphonenumber-js';

/**
 * Addresses that are not real customers. `@len.golf` is the placeholder staff
 * enter when a walk-in has no email — 383 of 411 staff bookings in the
 * Jul 4 - Aug 2 window carry the SAME one. Hashing and sending it would tell
 * Meta that a single person booked 383 times, and if that mailbox belongs to a
 * real Meta user, every staff booking misattributes onto them.
 */
const EMAIL_DOMAIN_DENYLIST = ['len.golf'];

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return null;

  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;

  // Exact domain match, not substring — `someone@notlen.golf.com` is a real
  // address and must survive.
  const domain = normalized.slice(at + 1);
  if (EMAIL_DOMAIN_DENYLIST.includes(domain)) return null;

  return normalized;
}

/**
 * Shared by normalizePhoneE164 and phoneCountry so every caller — including
 * Task 4's buildUserData, which needs both the E.164 string and the country
 * for the same row — parses each raw value exactly once.
 *
 * Thai numbers are stored in a mix of shapes (`0xx` 10-digit, `66xx` 11-digit,
 * bare 9-digit missing the leading zero) and the customer base includes real
 * international numbers (+65, +49, +44, +62). A blanket "+66" prefix corrupts
 * the internationals, so parse properly with TH as the default region: explicit
 * international numbers keep their own country, bare local ones resolve to TH.
 */
function parsePhone(raw: string | null | undefined): PhoneNumber | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed = parsePhoneNumberFromString(trimmed, 'TH');
    if (!parsed || !parsed.isValid()) return null;
    return parsed;
  } catch {
    // parsePhoneNumberFromString already returns undefined for ordinary bad
    // input (garbage, too short, etc.) — this only guards against an
    // unexpected exception from the library itself, so a single malformed
    // row in the unattended nightly batch can't take the whole run down.
    return null;
  }
}

export function normalizePhoneE164(raw: string | null | undefined): string | null {
  const parsed = parsePhone(raw);
  return parsed ? parsed.number : null;
}

/**
 * Lowercase ISO-3166-1 alpha-2, derived from the number itself. Meta accepts
 * `country` as a match key; hardcoding 'th' would be wrong for the +65/+49/+44
 * tourists and would feed Meta a false signal rather than no signal.
 */
export function phoneCountry(raw: string | null | undefined): string | null {
  const parsed = parsePhone(raw);
  return parsed?.country ? parsed.country.toLowerCase() : null;
}

export interface SplitName {
  first: string | null;
  last: string | null;
}

export function splitName(raw: string | null | undefined): SplitName {
  if (typeof raw !== 'string') return { first: null, last: null };

  // `\p{M}` (combining marks) is load-bearing, not decoration. Thai tone marks
  // and vowel signs are category Mn, and Thai has no precomposed letter+mark
  // forms — so `[^\p{L}\p{N}\s]` silently rewrites almost every Thai name
  // (สมชาย ใจดี -> สมชาย ใจด). Since the customer base is largely Thai, that
  // would hash the wrong string for most people: worse than sending no name,
  // because it looks like a signal and matches nobody.
  //
  // NFC first so a decomposed name and its precomposed twin hash identically —
  // once marks are preserved, "José" spelled two ways would otherwise produce
  // two different hashes.
  const cleaned = raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0) return { first: null, last: null };

  const parts = cleaned.split(' ');
  return {
    first: parts[0],
    last: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}
