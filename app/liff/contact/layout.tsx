import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "LENGOLF Contact Us",
  description: "Get in touch with LENGOLF - Contact information and directions",
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

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
