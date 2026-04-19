import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// /auth/error lives outside [locale] (URL is registered as the OAuth
// callback target). The root layout owns <html> + <body> + Providers,
// so this layout only contributes route-scoped metadata and viewport.

export const metadata: Metadata = {
  title: "LENGOLF Authentication",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
