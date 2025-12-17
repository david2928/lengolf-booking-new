import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "LENGOLF Lucky Draw",
  description: "Spin the wheel for exclusive prizes at LENGOLF",
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

export default function LuckyDrawLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
