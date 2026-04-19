import { routing, type Locale } from '@/i18n/routing';

export const SITE_URL = 'https://booking.len.golf';

// Maps our locale codes to Open Graph locale codes (language_TERRITORY).
// Used for og:locale on the canonical URL; siblings get og:locale:alternate
// via buildOpenGraphLocales().
export const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  th: 'th_TH',
  ko: 'ko_KR',
  ja: 'ja_JP',
  zh: 'zh_CN',
};

// Builds `og:locale` + `og:locale:alternate` entries for a page.
// `og:locale` is the current locale; alternates are the remaining locales.
export function buildOpenGraphLocales(currentLocale: Locale): {
  locale: string;
  alternateLocale: string[];
} {
  return {
    locale: OG_LOCALE[currentLocale],
    alternateLocale: routing.locales
      .filter((l) => l !== currentLocale)
      .map((l) => OG_LOCALE[l]),
  };
}

// Resolves an absolute URL for a given path + locale under our routing rules
// (`localePrefix: 'as-needed'` — English is unprefixed).
export function localePath(locale: Locale, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (locale === routing.defaultLocale) {
    return normalizedPath === '/' ? '' : normalizedPath;
  }
  return normalizedPath === '/' ? `/${locale}` : `/${locale}${normalizedPath}`;
}

// Builds `alternates` Metadata for a given page path.
// - `canonical` points to the current locale's URL (self-referential; recommended by Google)
// - `languages` maps each locale (+ `x-default`) to its translated URL
export function buildAlternates(currentLocale: Locale, path: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = `${SITE_URL}${localePath(locale, path)}`;
  }
  // x-default should point to the default (English) version per Google guidance.
  languages['x-default'] = `${SITE_URL}${localePath(routing.defaultLocale, path)}`;
  return {
    canonical: `${SITE_URL}${localePath(currentLocale, path)}`,
    languages,
  };
}
