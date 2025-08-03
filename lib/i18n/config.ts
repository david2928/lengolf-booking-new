import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

export const locales = ['en', 'th'] as const;
export const defaultLocale = 'en' as const;

export type Locale = typeof locales[number];

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

export function getLocaleFromSearchParams(searchParams: URLSearchParams): Locale {
  const lang = searchParams.get('lang');
  return isValidLocale(lang || '') ? (lang as Locale) : defaultLocale;
}

export function detectLocaleFromHeaders(): Locale {
  // Simple browser-side language detection
  if (typeof window !== 'undefined' && navigator.language) {
    if (navigator.language.startsWith('th')) {
      return 'th';
    }
  }
  
  return defaultLocale;
}

export default getRequestConfig(async () => {
  // For now, use default locale in server components
  // Client components will handle locale switching
  const locale = defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});