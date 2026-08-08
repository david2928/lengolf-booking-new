import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import GoogleTagManager from "@/components/shared/GoogleTagManager";

// LIFF pages sit outside [locale] because their URLs are registered with
// the LINE console. The root layout owns <html> + <body> + Providers, so
// this layout only sets LIFF-specific metadata, the WebView-tuned viewport
// (no user scaling, for the LIFF in-app browser), and the GTM container.

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
  return (
    <>
      {/* Without this, every dataLayer push from a LIFF page goes into an array
          nothing reads. `pushBookingConfirmed()` has been called from
          `/liff/booking` since PR #136 and was inert for exactly that reason,
          while LIFF produced more self-service bookings than the web flow did.

          Mounting it in the LAYOUT rather than in `booking/page.tsx` is
          deliberate: the container's GA4 config tag needs to initialise on the
          page view, well before the confirmation push, and every LIFF route
          (membership, promotions, lucky-draw, coaching) becomes measurable
          rather than just the one that happens to convert. */}
      <GoogleTagManager />
      {children}
    </>
  );
}
