import { routing } from './routing';

/**
 * Prefix an app path with a locale, the way `localePrefix: 'as-needed'` does.
 *
 * Why not `getPathname` from `@/i18n/navigation`: that helper comes from
 * `createNavigation` and reaches for `useParams`, which makes it unusable from
 * a plain client component that only needs to BUILD a string (it throws
 * `navigation.useParams is not a function` outside a router context, and takes
 * a component's tests with it).
 *
 * Why not hand-roll it at each call site: the default locale is unprefixed
 * under `as-needed`, and forgetting that is how `/en/bookings` ends up in a
 * callbackUrl — or worse, how a Thai customer gets silently returned to the
 * English page. One place, one rule, one test.
 *
 * `href` must be an app-absolute path with no query string. Callers building a
 * `callbackUrl` back into the booking flow depend on that: `useBookingFlow`
 * treats `selectDate` / `package` / `club` as a deep link and skips its
 * sessionStorage restore entirely, so a stray parameter silently discards the
 * in-progress booking.
 */
export function localePath(href: string, locale: string): string {
  if (!href.startsWith('/')) {
    throw new Error(`localePath expects an app-absolute path, got: ${href}`);
  }

  // Unknown locale: return the path untouched rather than inventing a prefix
  // that would 404. Callers pass `useLocale()`, so this is defensive only.
  if (!(routing.locales as readonly string[]).includes(locale)) {
    return href;
  }

  return locale === routing.defaultLocale ? href : `/${locale}${href}`;
}
