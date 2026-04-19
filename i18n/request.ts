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
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
