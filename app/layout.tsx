import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import { getLocale } from 'next-intl/server';
import './globals.css';
import { Providers } from './providers';

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
  metadataBase: new URL('https://booking.len.golf'),
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // `getLocale()` returns whatever next-intl's middleware resolved for the
  // current request (from URL prefix, NEXT_LOCALE cookie, or the configured
  // default). For non-locale routes like /liff/* and /auth/error that don't
  // go through [locale], this falls back to the default ('en').
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${poppins.variable} font-sans`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
