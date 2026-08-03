// LIFF URLs for navigating between LIFF apps
// These URLs ensure proper LIFF context is maintained when switching pages

export const LIFF_URLS = {
  booking: 'https://liff.line.me/2007027277-ShDmuSHO',
  membership: 'https://liff.line.me/2007027277-MmFezHiv',
  coaching: 'https://liff.line.me/2007027277-45B0681x',
  bayRates: 'https://liff.line.me/2007027277-epOPg1V1',
  promotions: 'https://liff.line.me/2007027277-cC9YrZwM',
  contact: 'https://liff.line.me/2007027277-eIHDgwde',
} as const;

export type LiffPage = keyof typeof LIFF_URLS;

export function getLiffBookingDetailUrl(bookingId: string): string {
  return `${LIFF_URLS.membership}/booking/${bookingId}`;
}

export function getLiffBookingEditUrl(bookingId: string): string {
  return `${LIFF_URLS.membership}/booking/${bookingId}/edit`;
}

/**
 * Back to the detail page after an edit, bypassing its 30s cache.
 *
 * `appCache` is per-lambda-instance, so the eviction the modify route performs
 * is best-effort: the return navigation can land on a different instance and be
 * served the pre-edit date and time. Asking for a fresh read is what actually
 * guarantees the customer sees the change they just made.
 */
export function getLiffBookingDetailFreshUrl(bookingId: string): string {
  return `${getLiffBookingDetailUrl(bookingId)}?fresh=1`;
}
