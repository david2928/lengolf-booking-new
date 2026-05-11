'use client';

import { useState, useEffect, startTransition } from 'react';
import { getCachedPricing, loadPricing } from '@/lib/pricing';

/**
 * Hook that triggers pricing load on mount.
 * Causes a re-render when pricing becomes available so dynamic getters
 * return API data instead of hardcoded fallbacks.
 */
export function usePricingLoader(): void {
  const [, setLoaded] = useState(!!getCachedPricing());

  useEffect(() => {
    if (getCachedPricing()) return;
    // startTransition marks the post-fetch re-render as non-urgent so it
    // can't block initial paint or user input on slow mobile CPUs.
    loadPricing().then(() => startTransition(() => setLoaded(true)));
  }, []);
}
