import { Language, isValidLanguage } from './translations';

const STORAGE_KEY = 'liff-language';

/**
 * Save language preference to localStorage and optionally to the database.
 * If lineUserId is provided, fires a fire-and-forget POST to persist to DB.
 * Failures are silently logged (graceful degradation).
 */
export function saveLanguagePreference(language: Language, lineUserId?: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, language);
  }

  if (lineUserId) {
    fetch('/api/liff/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineUserId, language }),
    }).catch((err) => {
      console.warn('[Language] Failed to persist language to DB:', err);
    });
  }
}

/**
 * Resolve the user's language preference.
 * Priority: localStorage > DB value > LINE SDK > 'en'.
 * If localStorage is empty but DB has a value, populates localStorage (cross-device sync).
 */
export function resolveLanguage(dbPreferredLanguage?: string | null): Language {
  // 1. Check localStorage
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidLanguage(stored)) {
      return stored;
    }
  }

  // 2. Check DB value (cross-device sync)
  if (dbPreferredLanguage && isValidLanguage(dbPreferredLanguage)) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, dbPreferredLanguage);
    }
    return dbPreferredLanguage;
  }

  // 3. Check LINE SDK
  if (typeof window !== 'undefined' && window.liff) {
    const lineLang = window.liff.getLanguage?.();
    if (lineLang && isValidLanguage(lineLang)) {
      localStorage.setItem(STORAGE_KEY, lineLang);
      return lineLang;
    }
  }

  // 4. Default
  return 'en';
}
