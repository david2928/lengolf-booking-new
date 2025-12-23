import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'LENGOLF Membership',
  description: 'View your LENGOLF packages, bookings, and member profile',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MembershipLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* DNS prefetch and preconnect to LINE CDN for faster LIFF SDK loading */}
      <link rel="dns-prefetch" href="https://static.line-scdn.net" />
      <link rel="preconnect" href="https://static.line-scdn.net" crossOrigin="anonymous" />

      {/* Preload LIFF SDK with high priority */}
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
