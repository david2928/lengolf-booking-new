/**
 * Dynamic Pricing Service
 * Fetches product pricing from the shared pricing API (lengolf-forms).
 * Module-level cache with 30-minute TTL ensures fresh data without excessive requests.
 * All consumers fall back to hardcoded defaults if the API is unavailable.
 *
 * NOTE: This module is shared between server and client. Do NOT add 'use client'.
 * The React hook lives in lib/pricing-hook.ts.
 */

// ─── Types (mirrors the API response) ────────────────────────────────────────

export interface PricingProduct {
  name: string;
  price: number;
  modifiers?: Array<{ name: string; price: number }>;
}

export interface PricingCatalog {
  bayRates: {
    morning: PricingProduct[];
    afternoon: PricingProduct[];
    evening: PricingProduct[];
  };
  packages: PricingProduct[];
  coaching: PricingProduct[];
  clubRental: {
    indoor: PricingProduct[];
    course: PricingProduct[];
    addons: PricingProduct[];
  };
  mixedPackages: PricingProduct[];
  drinksAndGolf: PricingProduct[];
  events: PricingProduct[];
  fetchedAt: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const PRICING_API =
  process.env.NEXT_PUBLIC_PRICING_API_URL ||
  'https://lengolf-forms.vercel.app/api/pricing';

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ─── Module-level cache ──────────────────────────────────────────────────────

let _catalog: PricingCatalog | null = null;
let _cachedAt = 0;
let _loadPromise: Promise<PricingCatalog | null> | null = null;
let _failed = false;

/** Minimal validation that the API response has the expected shape. */
function isValidCatalog(data: unknown): data is PricingCatalog {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.bayRates != null &&
    typeof d.bayRates === 'object' &&
    d.coaching != null &&
    Array.isArray(d.coaching) &&
    d.clubRental != null &&
    typeof d.clubRental === 'object'
  );
}

/**
 * Fetch pricing catalog from the API. Deduplicates concurrent calls.
 * Returns null if the API is unavailable.
 * Caches for 30 minutes; failed requests are not retried until next page load.
 */
export async function loadPricing(): Promise<PricingCatalog | null> {
  // Return cached if still fresh
  if (_catalog && Date.now() - _cachedAt < CACHE_TTL) return _catalog;
  // Don't retry after a failure in the same page lifecycle
  if (_failed) return null;
  // Deduplicate concurrent calls
  if (_loadPromise) return _loadPromise;

  _loadPromise = fetch(PRICING_API)
    .then((res) => {
      if (!res.ok) throw new Error(`Pricing API responded ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (!isValidCatalog(data)) {
        throw new Error('Unexpected pricing API response structure');
      }
      _catalog = data;
      _cachedAt = Date.now();
      return _catalog;
    })
    .catch((err) => {
      console.warn('[pricing] Failed to load dynamic pricing:', err.message);
      _failed = true;
      return null;
    })
    .finally(() => {
      _loadPromise = null;
    });

  return _loadPromise;
}

/**
 * Returns the cached pricing catalog (synchronous).
 * Returns null if pricing hasn't been loaded yet or failed.
 */
export function getCachedPricing(): PricingCatalog | null {
  return _catalog;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Find a product's price by regex matching its name.
 * Returns the fallback if no match is found.
 */
export function findPrice(
  products: Array<{ name: string; price: number }>,
  pattern: RegExp,
  fallback: number
): number {
  const match = products.find((p) => pattern.test(p.name));
  return match?.price ?? fallback;
}

