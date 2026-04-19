import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import type { ReactNode } from 'react';
import { routing, isValidLocale, type Locale } from '@/i18n/routing';
import ChatWidgetLoader from '@/components/chat/ChatWidgetLoader';
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
  const t = await getTranslations({ locale, namespace: 'seo.site' });
  const alternates = buildAlternates(locale as Locale, '/');
  const og = buildOpenGraphLocales(locale as Locale);

  return {
    title: {
      default: t('title'),
      template: '%s | LENGOLF Bangkok',
    },
    description: t('description'),
    keywords: [
      'golf simulator bangkok',
      'indoor golf bangkok',
      'golf practice bangkok',
      'golf lessons bangkok',
      'lengolf',
      'mercury ville golf',
      'chidlom golf',
      'golf booking bangkok',
      'korean golf simulator',
      'golf training bangkok',
    ],
    authors: [{ name: 'LENGOLF' }],
    creator: 'LENGOLF',
    publisher: 'LENGOLF',
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(SITE_URL),
    alternates,
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
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
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('twitterDescription'),
      images: [`${SITE_URL}/images/lengolf.jpg`],
    },
    category: 'sports',
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
      other: [
        { url: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', rel: 'icon' },
        { url: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', rel: 'icon' },
      ],
    },
    manifest: '/site.webmanifest',
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  // next-intl v3 requires explicit `locale` + `messages` on the client
  // provider — they are NOT auto-forwarded from the server context.
  const messages = await getMessages();

  return (
    <>
      {/* GTM + structured-data — scoped to [locale] so LIFF and /auth/error
          don't pull analytics unnecessarily. */}
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`
          window.ttq = window.ttq || {
            track: function() {},
            page: function() {},
            batch: function() {}
          };

          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-MKCHVJKW');

          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'AW-16456389020');
          gtag('config', 'GTM-MKCHVJKW', {
            linker: { domains: ['len.golf'], decorate_forms: false }
          });
        `}
      </Script>
      <Script
        id="structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SportsActivityLocation',
            name: 'LENGOLF Bangkok',
            description: 'Premier indoor golf simulator facility in Bangkok with state-of-the-art Korean simulators, professional coaching, and great amenities.',
            url: 'https://booking.len.golf',
            telephone: '+66966682335',
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'The Mercury Ville @ BTS Chidlom, Floor 4',
              addressLocality: 'Bangkok',
              addressRegion: 'Bangkok',
              postalCode: '10330',
              addressCountry: 'TH'
            },
            geo: {
              '@type': 'GeoCoordinates',
              latitude: '13.7445',
              longitude: '100.5431'
            },
            openingHoursSpecification: {
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
              opens: '09:00',
              closes: '23:00'
            },
            priceRange: '฿฿฿',
            amenityFeature: [
              { '@type': 'LocationFeatureSpecification', name: 'Golf Simulators', value: true },
              { '@type': 'LocationFeatureSpecification', name: 'Professional Coaching', value: true },
              { '@type': 'LocationFeatureSpecification', name: 'Equipment Rental', value: true },
            ]
          })
        }}
      />
      <noscript>
        <iframe
          src="https://www.googletagmanager.com/ns.html?id=GTM-MKCHVJKW"
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
        <ChatWidgetLoader />
        <Analytics />
      </NextIntlClientProvider>
    </>
  );
}
