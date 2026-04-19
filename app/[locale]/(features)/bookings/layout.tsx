import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { isValidLocale, type Locale } from '@/i18n/routing';
import {
  SITE_URL,
  buildAlternates,
  buildOpenGraphLocales,
} from '@/lib/seo/alternates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) {
    return {};
  }
  const tSite = await getTranslations({ locale, namespace: 'seo.site' });
  const alternates = buildAlternates(locale as Locale, '/bookings');
  const og = buildOpenGraphLocales(locale as Locale);

  return {
    title: tSite('title'),
    description: tSite('description'),
    alternates,
    openGraph: {
      title: tSite('ogTitle'),
      description: tSite('ogDescription'),
      url: alternates.canonical,
      siteName: 'LENGOLF Bangkok',
      images: [
        {
          url: `${SITE_URL}/images/lengolf.jpg`,
          width: 1200,
          height: 630,
          alt: 'LENGOLF Indoor Golf Simulator Facility',
        },
      ],
      locale: og.locale,
      alternateLocale: og.alternateLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: tSite('title'),
      description: tSite('twitterDescription'),
      images: [`${SITE_URL}/images/lengolf.jpg`],
    },
  };
}

export default function BookingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
