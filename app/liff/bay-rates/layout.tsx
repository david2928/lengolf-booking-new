import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "LENGOLF Bay Rates",
  description: "Golf simulator bay rates and pricing - LENGOLF Bangkok",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function BayRatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
