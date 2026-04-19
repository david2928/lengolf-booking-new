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
  const t = await getTranslations({ locale, namespace: 'seo.golfClubRental' });
  const alternates = buildAlternates(locale as Locale, '/golf-club-rental');
  const og = buildOpenGraphLocales(locale as Locale);

  return {
    title: t('title'),
    description: t('description'),
    keywords: [
      'golf club rental Bangkok',
      'rent golf clubs Bangkok',
      'premium golf club rental Thailand',
      'Callaway golf club rental',
      'golf equipment rental Bangkok',
      'indoor golf club rental',
      'golf simulator Bangkok',
      'LENGOLF club rental',
      'golf club hire Bangkok',
      'rent golf clubs Thailand',
      'ladies golf club rental Bangkok',
      'mens golf club rental Bangkok',
    ],
    alternates,
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      type: 'website',
      locale: og.locale,
      alternateLocale: og.alternateLocale,
      siteName: 'LENGOLF Bangkok',
      url: alternates.canonical,
      images: [
        {
          url: `${SITE_URL}/images/premium_club_rental.jpg`,
          width: 1200,
          height: 630,
          alt: 'LENGOLF Premium Golf Club Rental - Callaway Warbird & Majesty Shuttle Sets',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('twitterDescription'),
      images: [`${SITE_URL}/images/premium_club_rental.jpg`],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default function GolfClubRentalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
