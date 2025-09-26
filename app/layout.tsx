import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import Script from 'next/script';
import ChatWidget from '@/components/chat/ChatWidget';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: "LENGOLF - Indoor Golf Simulator in Bangkok | Book Your Bay",
    template: "%s | LENGOLF Bangkok"
  },
  description: "Experience Bangkok's premier indoor golf simulator at LENGOLF. Located at Mercury Ville @ BTS Chidlom. State-of-the-art Korean simulators, professional coaching, and great food & drinks. Book your bay now!",
  keywords: [
    "golf simulator bangkok",
    "indoor golf bangkok",
    "golf practice bangkok",
    "golf lessons bangkok",
    "lengolf",
    "mercury ville golf",
    "chidlom golf",
    "golf booking bangkok",
    "korean golf simulator",
    "golf training bangkok"
  ],
  authors: [{ name: "LENGOLF" }],
  creator: "LENGOLF",
  publisher: "LENGOLF",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://booking.len.golf'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: "LENGOLF - Bangkok's Premier Indoor Golf Simulator Experience",
    description: "Experience Bangkok's top-rated indoor golf simulator in the heart of the city! Located at Mercury Ville @ BTS Chidlom, LENGOLF offers state-of-the-art Korean simulators in a fun, relaxed environment. Perfect for all skill levels with great food & drinks. Book your bay now! 🏌️‍♂️✨",
    url: 'https://booking.len.golf',
    siteName: 'LENGOLF Bangkok',
    images: [
      {
        url: 'https://booking.len.golf/images/lengolf.jpg',
        width: 1200,
        height: 630,
        alt: 'LENGOLF Indoor Golf Simulator Facility',
      },
    ],
    locale: 'en_US',
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
    title: 'LENGOLF - Indoor Golf Simulator in Bangkok',
    description: 'Book your golf simulator bay at LENGOLF Bangkok. Perfect for practice, lessons, or fun with friends. Located at Mercury Ville @ BTS Chidlom.',
    images: ['https://booking.len.golf/images/lengolf.jpg'],
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
  verification: {
    google: 'your-google-site-verification', // You'll need to add your actual verification code
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${poppins.variable} font-sans`}>
      <head>
        {/* Google Tag Manager */}
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            // Safety check for TikTok Pixel
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

            // Initialize dataLayer
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'GTM-MKCHVJKW', {
              linker: {
                domains: ['len.golf'],
                decorate_forms: false
              }
            });
          `}
        </Script>

        {/* JSON-LD Structured Data */}
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
                dayOfWeek: [
                  'Monday',
                  'Tuesday',
                  'Wednesday',
                  'Thursday',
                  'Friday',
                  'Saturday',
                  'Sunday'
                ],
                opens: '10:00',
                closes: '23:00'
              },
              priceRange: '฿฿฿',
              amenityFeature: [
                {
                  '@type': 'LocationFeatureSpecification',
                  name: 'Golf Simulators',
                  value: true
                },
                {
                  '@type': 'LocationFeatureSpecification',
                  name: 'Professional Coaching',
                  value: true
                },
                {
                  '@type': 'LocationFeatureSpecification',
                  name: 'Equipment Rental',
                  value: true
                }
              ]
            })
          }}
        />
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" 
          integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" 
          crossOrigin="anonymous" 
          referrerPolicy="no-referrer" 
        />
      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MKCHVJKW"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <Providers>
          {children}
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
