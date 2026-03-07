import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Golf Course Club Rental Bangkok | Premium Clubs Delivered | LENGOLF',
  description: 'Rent premium golf clubs for Bangkok golf courses. Callaway Paradym, Warbird & Majesty Shuttle sets. Daily rates from ฿1,200. Delivery available. Book online at LENGOLF.',
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
    description: 'Rent premium golf clubs for Bangkok golf courses. Callaway Paradym & Warbird sets with delivery. Daily & multi-day rates. Book online!',
    type: 'website',
    locale: 'en_US',
    siteName: 'LENGOLF Bangkok',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function CourseRentalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
