'use client';

import { SessionProvider } from 'next-auth/react';
import { VipStatusProvider } from '@/components/providers/VipStatusProvider';
import { NextIntlClientProvider } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { getLocaleFromSearchParams, defaultLocale } from '@/lib/i18n/config';
import { getCurrentLocaleWithFallback, storeLanguageInSession } from '@/lib/i18n/session';
// import { GtmUserProfileProvider } from '@/components/providers/GtmUserProfileProvider';

function I18nProviderWrapperContent({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<'en' | 'th'>(defaultLocale);
  const [allMessages, setAllMessages] = useState<{ en: any; th: any } | null>(null);

  // Preload both language files on mount
  useEffect(() => {
    async function preloadMessages() {
      try {
        const [enModule, thModule] = await Promise.all([
          import(`../messages/en.json`),
          import(`../messages/th.json`)
        ]);
        setAllMessages({
          en: enModule.default,
          th: thModule.default
        });
      } catch (error) {
        console.error('Failed to preload messages:', error);
      }
    }
    preloadMessages();
  }, []);

  useEffect(() => {
    // Get locale from URL params with session fallback
    const detectedLocale = getCurrentLocaleWithFallback(searchParams || undefined);
    setLocale(detectedLocale);
    
    // Store in session when locale changes
    storeLanguageInSession(detectedLocale);
  }, [searchParams]);

  if (!allMessages) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <NextIntlClientProvider locale={locale} messages={allMessages[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}

function I18nProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <I18nProviderWrapperContent>
        {children}
      </I18nProviderWrapperContent>
    </Suspense>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <I18nProviderWrapper>
        <VipStatusProvider>
          {/* <GtmUserProfileProvider> */}
            {children}
          {/* </GtmUserProfileProvider> */}
        </VipStatusProvider>
      </I18nProviderWrapper>
    </SessionProvider>
  );
} 