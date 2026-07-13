import type { Locale } from '@/i18n/routing';

/** 1 year — matches `localeCookie.maxAge` in i18n/routing.ts. */
const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Persist the active locale to the `NEXT_LOCALE` cookie from the browser.
 *
 * Two things happen here, and both matter:
 *
 * 1. **Set the canonical, domain-scoped cookie.** next-intl v3's
 *    `router.replace(pathname, { locale })` does NOT manage this cookie — the
 *    server middleware sets it only when a locale-prefixed URL (`/th/...`) is
 *    visited. Switching TO the default locale (`en`) navigates to an unprefixed
 *    URL like `/bookings`, which the middleware would otherwise resolve from the
 *    stale cookie and 307-redirect back to `/{stale-locale}/bookings`. Writing
 *    the cookie first keeps the switch from bouncing. Attributes mirror
 *    i18n/routing.ts → `localeCookie` EXACTLY (same `.len.golf` domain in prod,
 *    same max-age, Path=/) so this cookie *shadows* the server-set one rather
 *    than duplicating it.
 *
 * 2. **Delete any legacy host-only cookie first.** Before commit `0ea9703`
 *    scoped the cookie to `.len.golf`, next-intl set `NEXT_LOCALE` host-only
 *    (`booking.len.golf`, no Domain attribute). That older cookie is more
 *    specific, so browsers send it ahead of the `.len.golf` one and the server
 *    reads IT — trapping long-time users on whatever language they last picked.
 *    The most visible symptom is "switch to English does nothing": English is
 *    the unprefixed default, so there is no URL prefix to override the stale
 *    cookie, and every click bounces back. A same-name write with a Domain
 *    attribute cannot overwrite a host-only cookie, so we explicitly delete the
 *    host-only variant (Max-Age=0, no Domain) before setting the scoped one.
 *
 * Uses the same `process.env.NODE_ENV === 'production'` predicate as
 * i18n/routing.ts (Next.js inlines it for client components at build time).
 * On localhost there is no shared parent domain, so the cookie is host-only by
 * necessity and step 2 simply overwrites it with the new value.
 */
export function writeLocaleCookie(locale: Locale): void {
  const domainAttr =
    process.env.NODE_ENV === 'production' ? '; Domain=.len.golf' : '';
  // 1) Remove the legacy host-only cookie (matches name + Path=/ + no Domain).
  document.cookie = 'NEXT_LOCALE=; Path=/; Max-Age=0; SameSite=lax';
  // 2) Set the canonical cookie (domain-scoped in production).
  document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=${MAX_AGE}; SameSite=lax${domainAttr}`;
}
