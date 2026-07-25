'use client';

import { useEffect } from 'react';
import { captureAttribution } from '@/lib/attribution/click-ids';

/**
 * Records the Google Ads click ID (gclid / gbraid / wbraid) and UTMs for the
 * current visit. Mounted once in the `[locale]` layout so it runs regardless of
 * which page the visitor lands on.
 *
 * Reads `window.location.search` inside an effect rather than via
 * `useSearchParams()` on purpose — the hook forces every page under this layout
 * out of static rendering, and we only need the params as they were on the
 * initial load anyway.
 *
 * Renders nothing. LIFF pages sit outside `[locale]` and are intentionally not
 * covered: they run inside the LINE in-app browser and receive no ad traffic.
 */
export default function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);

  return null;
}
