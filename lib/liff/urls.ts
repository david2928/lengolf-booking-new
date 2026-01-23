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
