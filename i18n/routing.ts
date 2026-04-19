import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'th', 'ko', 'ja', 'zh'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    // Share across len.golf subdomains (booking.len.golf, www.len.golf)
    // so language selection persists between the marketing site and booking.
    domain: process.env.NODE_ENV === 'production' ? '.len.golf' : undefined,
  },
});

export type Locale = (typeof routing.locales)[number];

export const localeNativeName: Record<Locale, string> = {
  en: 'English',
  th: 'ไทย',
  ko: '한국어',
  ja: '日本語',
  zh: '中文',
};

export function isValidLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}
