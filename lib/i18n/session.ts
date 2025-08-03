'use client';

import { type Locale, defaultLocale } from './config';

const LANGUAGE_STORAGE_KEY = 'lengolf_selected_language';

/**
 * Store the selected language in sessionStorage
 */
export function storeLanguageInSession(locale: Locale): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
    } catch (error) {
      console.warn('Failed to store language in session storage:', error);
    }
  }
}

/**
 * Retrieve the stored language from sessionStorage
 */
export function getLanguageFromSession(): Locale | null {
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(LANGUAGE_STORAGE_KEY);
      return stored as Locale || null;
    } catch (error) {
      console.warn('Failed to retrieve language from session storage:', error);
    }
  }
  return null;
}

/**
 * Clear the stored language from sessionStorage
 */
export function clearLanguageFromSession(): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(LANGUAGE_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear language from session storage:', error);
    }
  }
}

/**
 * Get the current locale from URL or session storage
 */
export function getCurrentLocaleWithFallback(searchParams?: URLSearchParams): Locale {
  // First try URL parameter
  if (searchParams) {
    const langParam = searchParams.get('lang');
    if (langParam === 'th') {
      // Store in session when found in URL
      storeLanguageInSession(langParam as Locale);
      return langParam as Locale;
    } else if (langParam === 'en') {
      // Store in session when found in URL
      storeLanguageInSession(langParam as Locale);
      return langParam as Locale;
    }
  }
  
  // If no lang parameter is present, it could mean:
  // 1. User is on English (default) - we should respect this choice
  // 2. User just loaded the page for first time
  // We need to differentiate between these cases
  
  // Check if we're in a navigation context where language was just switched
  if (typeof window !== 'undefined' && !searchParams?.get('lang')) {
    // If there's no lang parameter and we have session storage, 
    // only use session storage if it's not the default locale
    // This prevents the "always Thai" issue
    const sessionLang = getLanguageFromSession();
    if (sessionLang && sessionLang !== defaultLocale) {
      return sessionLang;
    }
  }
  
  // Finally fallback to default
  return defaultLocale;
}