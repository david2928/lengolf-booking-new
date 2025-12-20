import type { Metadata, Viewport } from 'next';

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
  return <>{children}</>;
}
