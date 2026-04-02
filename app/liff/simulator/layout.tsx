import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'LENGOLF Simulator Stats',
  description: 'View your golf simulator performance stats',
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

export default function SimulatorLayout({
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
