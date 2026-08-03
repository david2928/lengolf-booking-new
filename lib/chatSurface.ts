import { routing } from '@/i18n/routing';

const BOOKINGS_SEGMENT = 'bookings';

// localePrefix is 'as-needed': the default locale is never present in the URL,
// so only the other locales can appear as a leading segment.
const prefixedLocales: readonly string[] = routing.locales.filter(
  (locale) => locale !== routing.defaultLocale
);

/**
 * True for the bookings landing page and its locale-prefixed equivalents:
 * `/`, `/bookings`, `/th`, `/th/bookings`, ... — and nothing else.
 *
 * Bare `/` and bare `/{locale}` are included because both resolve to the
 * booking page (the root rewrites, a bare locale 308-redirects).
 */
export function isBookingsLandingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return true; // '/'

  const [first, ...rest] = segments;

  if (first === BOOKINGS_SEGMENT) return rest.length === 0; // '/bookings'
  if (!prefixedLocales.includes(first)) return false;

  return rest.length === 0 || (rest.length === 1 && rest[0] === BOOKINGS_SEGMENT);
}
