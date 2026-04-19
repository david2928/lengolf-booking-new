import type { MetadataRoute } from 'next';
import { routing, type Locale } from '@/i18n/routing';
import { SITE_URL, localePath } from '@/lib/seo/alternates';

// Public, crawlable pages. Auth-gated (VIP) and transactional
// (auth/login, bookings/confirmation) routes are intentionally excluded.
const PUBLIC_PATHS = [
  '/bookings',
  '/play-and-food',
  '/golf-club-rental',
  '/course-rental',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return PUBLIC_PATHS.map((path) => {
    const languages: Record<string, string> = {};
    for (const locale of routing.locales) {
      languages[locale] = `${SITE_URL}${localePath(locale as Locale, path)}`;
    }
    languages['x-default'] = `${SITE_URL}${localePath(routing.defaultLocale, path)}`;

    return {
      url: `${SITE_URL}${localePath(routing.defaultLocale, path)}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: path === '/bookings' ? 1.0 : 0.8,
      alternates: { languages },
    };
  });
}
