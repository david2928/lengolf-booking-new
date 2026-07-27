import { getRequestConfig } from 'next-intl/server';
import { routing, isValidLocale } from './routing';

// `isValidLocale` mirrors `hasLocale` from next-intl v4, which isn't exported
// on v3. Keep the swap until we bump next-intl.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && isValidLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    // MUST be set explicitly. Without it next-intl falls back to the *server
    // runtime's* zone and ships that to the client — which is UTC on Vercel.
    // Every `format.dateTime` then renders in UTC, so a calendar-picked date
    // (Bangkok-local midnight) displays as the PREVIOUS day: picking Jul 30
    // showed "Wed, Jul 29". Invisible locally, because the dev server already
    // runs in Asia/Bangkok and so serialises the correct zone.
    timeZone: 'Asia/Bangkok',
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
