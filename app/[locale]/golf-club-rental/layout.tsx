import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Golf Club Rental Bangkok | Premium Callaway Clubs | LENGOLF',
  description: 'Rent premium golf clubs in Bangkok. 2024 Callaway Warbird & Majesty Shuttle sets available. Hourly & daily rates from ฿150. Book online at LENGOLF indoor golf simulator.',
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
    'mens golf club rental Bangkok'
  ],
  openGraph: {
    title: 'Premium Golf Club Rental in Bangkok | LENGOLF',
    description: 'Rent 2024 Callaway Warbird & premium golf clubs at LENGOLF Bangkok. Flexible hourly & daily rates. Perfect for tourists & locals. Book online now!',
    type: 'website',
    locale: 'en_US',
    siteName: 'LENGOLF Bangkok',
    images: [
      {
        url: '/images/premium_club_rental.jpg',
        width: 1200,
        height: 630,
        alt: 'LENGOLF Premium Golf Club Rental - Callaway Warbird & Majesty Shuttle Sets',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Golf Club Rental Bangkok | LENGOLF',
    description: 'Rent premium 2024 golf clubs at LENGOLF. Callaway Warbird & Majesty Shuttle available. Book online!',
    images: ['/images/premium_club_rental.jpg'],
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
  alternates: {
    canonical: 'https://lengolf.com/golf-club-rental',
  },
};

export default function GolfClubRentalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}