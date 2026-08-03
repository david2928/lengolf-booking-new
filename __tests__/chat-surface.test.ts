/**
 * The chat widget is mounted globally from app/[locale]/layout.tsx and gates itself
 * on the pathname. The predicate is easy to get subtly wrong: an earlier regex
 * (`/^\/(th|ko|ja|zh)?(\/bookings)?\/?$/`) never matched the un-prefixed English
 * `/bookings`, because the optional locale group cannot absorb `bookings` and
 * `(\/bookings)?` wants a leading slash that `^\/` already consumed. That went
 * unnoticed because `/` rewrites to the English booking page, so English users
 * arriving at the root still saw the widget.
 */
import { isBookingsLandingPath } from '@/lib/chatSurface';
import { routing } from '@/i18n/routing';

describe('isBookingsLandingPath', () => {
  it('matches the root path', () => {
    expect(isBookingsLandingPath('/')).toBe(true);
  });

  it('matches the un-prefixed English bookings page', () => {
    expect(isBookingsLandingPath('/bookings')).toBe(true);
  });

  it('matches a bare locale prefix', () => {
    expect(isBookingsLandingPath('/th')).toBe(true);
  });

  it('matches a locale-prefixed bookings page', () => {
    expect(isBookingsLandingPath('/th/bookings')).toBe(true);
  });

  it('does not match other pages', () => {
    expect(isBookingsLandingPath('/vip')).toBe(false);
  });

  it('tolerates a trailing slash', () => {
    expect(isBookingsLandingPath('/bookings/')).toBe(true);
    expect(isBookingsLandingPath('/th/bookings/')).toBe(true);
  });

  it('derives the locale set from i18n/routing rather than a hand-written list', () => {
    for (const locale of routing.locales) {
      if (locale === routing.defaultLocale) continue;
      expect(isBookingsLandingPath(`/${locale}`)).toBe(true);
      expect(isBookingsLandingPath(`/${locale}/bookings`)).toBe(true);
    }
  });

  it('does not match the default locale as a prefix', () => {
    // localePrefix is 'as-needed', so middleware normalises /en/bookings -> /bookings;
    // the prefixed form never reaches the widget.
    expect(isBookingsLandingPath('/en')).toBe(false);
    expect(isBookingsLandingPath('/en/bookings')).toBe(false);
  });

  it('does not match deeper pages under the bookings tree', () => {
    expect(isBookingsLandingPath('/bookings/confirmation')).toBe(false);
    expect(isBookingsLandingPath('/th/bookings/confirmation')).toBe(false);
  });

  it('does not match LIFF or unknown prefixes', () => {
    expect(isBookingsLandingPath('/liff/booking')).toBe(false);
    expect(isBookingsLandingPath('/de/bookings')).toBe(false);
  });

  it('handles a missing pathname', () => {
    expect(isBookingsLandingPath(null)).toBe(false);
    expect(isBookingsLandingPath(undefined)).toBe(false);
    expect(isBookingsLandingPath('')).toBe(false);
  });
});
