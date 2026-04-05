'use client';

import { useState, useEffect } from 'react';
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
    loadPricing().then(() => setLoaded(true));
  }, []);
}
