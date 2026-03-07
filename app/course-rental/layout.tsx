import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Golf Course Club Rental Bangkok | Premium Clubs Delivered | LENGOLF',
  description: 'Rent premium golf clubs for Bangkok golf courses. Callaway Paradym, Warbird & Majesty Shuttle sets. Daily rates from ฿1,200. Delivery within Bangkok ฿500. Call 096-668-2335 or LINE @lengolf. Book online at LENGOLF.',
  keywords: [
    'golf club rental Bangkok course',
    'rent golf clubs Bangkok golf course',
    'golf equipment rental Thailand',
    'Callaway golf club rental delivery',
    'golf club hire Bangkok',
    'premium golf club rental Thailand',
    'golf course equipment rental',
    'LENGOLF course rental',
  ],
  openGraph: {
    title: 'Golf Course Club Rental in Bangkok | LENGOLF',
    description: 'Rent premium golf clubs for Bangkok golf courses. Callaway Paradym & Warbird sets with delivery. Daily & multi-day rates. Call 096-668-2335 or LINE @lengolf.',
    type: 'website',
    locale: 'en_US',
    siteName: 'LENGOLF Bangkok',
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'LENGOLF - Golf Club Rental',
  description: 'Premium golf club rental for Bangkok golf courses. Callaway Paradym, Warbird & Majesty Shuttle sets available daily or multi-day with delivery.',
  url: 'https://booking.len.golf/course-rental',
  telephone: '+66966682335',
  email: 'notification@len.golf',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '4th Floor, Mercury Ville at BTS Chidlom',
    addressLocality: 'Bangkok',
    addressCountry: 'TH',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 13.7437,
    longitude: 100.5408,
  },
  priceRange: '฿1,200 - ฿16,800',
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens: '10:00',
    closes: '22:00',
  },
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Golf Club Rental Sets',
    itemListElement: [
      {
        '@type': 'Offer',
        name: "Premium Men's - Callaway Warbird",
        priceCurrency: 'THB',
        price: '1200',
        description: 'Full set of Callaway Warbird clubs for men. Daily course rental.',
      },
      {
        '@type': 'Offer',
        name: "Premium+ Men's - Callaway Paradym",
        priceCurrency: 'THB',
        price: '1500',
        description: 'Full set of Callaway Paradym clubs for men. Daily course rental.',
      },
      {
        '@type': 'Offer',
        name: "Premium Women's - Majesty Shuttle",
        priceCurrency: 'THB',
        price: '1200',
        description: 'Full set of Majesty Shuttle clubs for women. Daily course rental.',
      },
    ],
  },
  sameAs: [
    'https://lin.ee/uxQpIXn',
    'https://www.len.golf',
  ],
};

export default function CourseRentalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
