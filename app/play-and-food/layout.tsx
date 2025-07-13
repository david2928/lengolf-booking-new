import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Play & Food Packages - LENGOLF Golf Entertainment',
  description: 'Ultimate golf entertainment experience combining simulator play with delicious food. Starting from 240 THB per person. Perfect for groups and families.',
  keywords: [
    'golf entertainment Bangkok',
    'indoor golf dining experience', 
    'group golf activities',
    'family golf entertainment',
    'golf simulator packages',
    'LENGOLF packages',
    'golf and food',
    'group entertainment'
  ],
  openGraph: {
    title: 'Play & Food Packages - LENGOLF Golf Entertainment',
    description: 'Ultimate golf entertainment experience combining simulator play with delicious food. Starting from 240 THB per person.',
    type: 'website',
    locale: 'en_US',
    siteName: 'LENGOLF',
    images: [
      {
        url: '/images/Play and food_1.jpg',
        width: 1200,
        height: 630,
        alt: 'LENGOLF Play & Food Package Experience',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play & Food Packages - LENGOLF Golf Entertainment',
    description: 'Ultimate golf entertainment experience combining simulator play with delicious food. Starting from 240 THB per person.',
    images: ['/images/Play and food_1.jpg'],
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

export default function PlayAndFoodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}