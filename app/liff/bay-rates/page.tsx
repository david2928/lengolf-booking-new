'use client';

import { useEffect, useState } from 'react';
import { Language } from '@/lib/liff/translations';
import BayRatesHeader from '@/components/liff/bay-rates/BayRatesHeader';
import PricingTable from '@/components/liff/bay-rates/PricingTable';
import CurrentTimeIndicator from '@/components/liff/bay-rates/CurrentTimeIndicator';
import OperatingHours from '@/components/liff/bay-rates/OperatingHours';
import Amenities from '@/components/liff/bay-rates/Amenities';
import QuickLinks from '@/components/liff/bay-rates/QuickLinks';
import BookNowButton from '@/components/liff/bay-rates/BookNowButton';

type ViewState = 'loading' | 'error' | 'ready';

export default function BayRatesPage() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [language, setLanguage] = useState<Language>('en');
  const [error, setError] = useState('');

  useEffect(() => {
    initializePage();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLanguage = localStorage.getItem('liff-bay-rates-language') as Language;
      if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'th')) {
        setLanguage(savedLanguage);
      }
    }
  }, []);

  const initializePage = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const devMode = urlParams.get('dev') === 'true';

      if (devMode && process.env.NODE_ENV === 'development') {
        console.log('[DEV MODE] Bay Rates page loaded without LIFF');
        setViewState('ready');
        return;
      }

      if (!window.liff) {
        const script = document.createElement('script');
        script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
        script.async = true;
        document.body.appendChild(script);

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId || liffId === 'your-liff-id-here') {
        console.warn('LIFF ID not configured. Page will work without LIFF features.');
        setViewState('ready');
        return;
      }

      await window.liff.init({ liffId }).catch((err) => {
        console.error('LIFF init error:', err);
        setViewState('ready');
        return;
      });

      setViewState('ready');
    } catch (err) {
      console.error('Error initializing page:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize page');
      setViewState('ready');
    }
  };

  const toggleLanguage = () => {
    const newLanguage = language === 'en' ? 'th' : 'en';
    setLanguage(newLanguage);
    if (typeof window !== 'undefined') {
      localStorage.setItem('liff-bay-rates-language', newLanguage);
    }
  };

  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
          <div className="text-red-600 text-center mb-4">
            <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold">Error</h2>
          </div>
          <p className="text-gray-600 text-center">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <BayRatesHeader language={language} onLanguageToggle={toggleLanguage} />

      <div className="p-4 space-y-4 pb-8">
        <CurrentTimeIndicator language={language} />

        <PricingTable language={language} />

        <OperatingHours language={language} />

        <Amenities language={language} />

        <QuickLinks language={language} />

        <BookNowButton language={language} />
      </div>
    </div>
  );
}
