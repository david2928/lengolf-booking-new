'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { type Locale, defaultLocale, isValidLocale } from './config';
import { getCurrentLocaleWithFallback } from './session';

export function useI18nRouter() {
  const router = useRouter();
  
  let searchParams: URLSearchParams | null = null;
  try {
    searchParams = useSearchParams();
  } catch (error) {
    // Handle SSR or build-time issues with useSearchParams
    searchParams = null;
  }

  const getCurrentLocale = useCallback((): Locale => {
    return getCurrentLocaleWithFallback(searchParams || undefined);
  }, [searchParams]);

  const push = useCallback((href: string, locale?: Locale) => {
    const targetLocale = locale || getCurrentLocale();
    const url = new URL(href, window.location.origin);
    
    if (targetLocale !== defaultLocale) {
      url.searchParams.set('lang', targetLocale);
    } else {
      url.searchParams.delete('lang');
    }
    
    router.push(url.pathname + url.search);
  }, [router, getCurrentLocale]);

  const replace = useCallback((href: string, locale?: Locale) => {
    const targetLocale = locale || getCurrentLocale();
    const url = new URL(href, window.location.origin);
    
    if (targetLocale !== defaultLocale) {
      url.searchParams.set('lang', targetLocale);
    } else {
      url.searchParams.delete('lang');
    }
    
    router.replace(url.pathname + url.search);
  }, [router, getCurrentLocale]);

  const switchLocale = useCallback((newLocale: Locale) => {
    const url = new URL(window.location.href);
    
    if (newLocale !== defaultLocale) {
      url.searchParams.set('lang', newLocale);
    } else {
      url.searchParams.delete('lang');
    }
    
    // Update session storage immediately when switching
    if (typeof window !== 'undefined') {
      try {
        if (newLocale !== defaultLocale) {
          sessionStorage.setItem('lengolf_selected_language', newLocale);
        } else {
          sessionStorage.removeItem('lengolf_selected_language');
        }
      } catch (error) {
        console.warn('Failed to update language in session storage:', error);
      }
    }
    
    router.replace(url.pathname + url.search);
  }, [router]);

  return {
    push,
    replace,
    switchLocale,
    getCurrentLocale
  };
}