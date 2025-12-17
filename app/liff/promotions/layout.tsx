import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "LENGOLF Promotions",
  description: "Check out our latest promotions and special offers at LENGOLF",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function PromotionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
