'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { type Locale, defaultLocale, getLocaleFromSearchParams } from './config';

// Hook to get current locale from URL params
function useCurrentLocaleInternal(): Locale {
  const searchParams = useSearchParams();
  if (!searchParams) return defaultLocale;
  return getLocaleFromSearchParams(searchParams);
}

// Wrapper component that provides Suspense boundary
function LocaleProvider({ children }: { children: (locale: Locale) => React.ReactNode }) {
  const locale = useCurrentLocaleInternal();
  return <>{children(locale)}</>;
}

// Hook to get current locale from URL params with Suspense boundary
export function useCurrentLocale(): Locale {
  try {
    return useCurrentLocaleInternal();
  } catch (error) {
    // Fallback to default locale if useSearchParams fails
    return defaultLocale;
  }
}

export { LocaleProvider };