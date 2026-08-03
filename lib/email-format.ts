/**
 * Is this string usable as an email RECIPIENT?
 *
 * Deliberately the loosest check that still rules out a value SMTP cannot
 * address. Full RFC 5322 is famously unmatchable by regex, and every attempt
 * that tries rejects real addresses; the only authority on deliverability is a
 * confirmation link, which this flow does not have. So the bar here is exactly
 * "nodemailer will accept an envelope containing it".
 *
 * The predicate is shared rather than re-typed because it already existed in
 * two places (`app/liff/booking/page.tsx`, `lib/club-rental/resolve-customer.ts`)
 * and NOT in the main booking flow, which is how booking BK260803FKLR came to
 * be created with the email `r` on 2026-08-03. Nodemailer refused the envelope
 * (`EENVELOPE: No recipients defined`), no confirmation was ever sent, and the
 * failure was recorded as a success. One import is the point.
 *
 * Callers must run this on BOTH sides. The booking flow's primary CTA lives
 * outside the `<form>` and calls its handler directly, so the browser never
 * runs constraint validation on `<input type="email">` — the field's own
 * `type` catches nothing here.
 */
export function isValidEmail(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * The trimmed address if it is usable, otherwise null.
 *
 * Collapsing "absent" and "malformed" into one null is intended: every caller
 * that needs a recipient treats them identically, and the shape composes into
 * a fallback chain (`normalizeEmail(a) ?? normalizeEmail(b)`) without either
 * branch having to re-test.
 */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (!isValidEmail(value)) return null;
  return (value as string).trim();
}
