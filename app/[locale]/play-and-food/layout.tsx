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
  const t = await getTranslations({ locale, namespace: 'seo.playAndFood' });
  const alternates = buildAlternates(locale as Locale, '/play-and-food');
  const og = buildOpenGraphLocales(locale as Locale);

  return {
    title: t('title'),
    description: t('description'),
    keywords: [
      'golf entertainment Bangkok',
      'indoor golf dining experience',
      'group golf activities',
      'family golf entertainment',
      'golf simulator packages',
      'LENGOLF packages',
      'golf and food',
      'group entertainment',
    ],
    alternates,
    openGraph: {
      title: t('title'),
      description: t('ogDescription'),
      type: 'website',
      locale: og.locale,
      alternateLocale: og.alternateLocale,
      siteName: 'LENGOLF',
      url: alternates.canonical,
      images: [
        {
          url: `${SITE_URL}/images/Play and food_1.jpg`,
          width: 1200,
          height: 630,
          alt: 'LENGOLF Play & Food Package Experience',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('ogDescription'),
      images: [`${SITE_URL}/images/Play and food_1.jpg`],
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

export default function PlayAndFoodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
