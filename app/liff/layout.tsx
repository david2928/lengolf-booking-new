import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// LIFF pages sit outside [locale] because their URLs are registered with
// the LINE console. The root layout owns <html> + <body> + Providers, so
// this layout only sets LIFF-specific metadata and the WebView-tuned
// viewport (no user scaling, for the LIFF in-app browser).

export const metadata: Metadata = {
  title: "LENGOLF",
  description: "LENGOLF LINE Mini App",
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

export default function LiffLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
