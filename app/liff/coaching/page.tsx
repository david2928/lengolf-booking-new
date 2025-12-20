'use client';

import { useEffect, useState } from 'react';
import { Language } from '@/lib/liff/translations';
import CoachingHeader from '@/components/liff/coaching/CoachingHeader';
import CoachList from '@/components/liff/coaching/CoachList';
import PricingTable from '@/components/liff/coaching/PricingTable';
import SpecialPackages from '@/components/liff/coaching/SpecialPackages';
import AvailabilityPreview from '@/components/liff/coaching/AvailabilityPreview';
import BookingCTA from '@/components/liff/coaching/BookingCTA';

type ViewState = 'loading' | 'error' | 'ready';

interface CoachAvailability {
  id: string;
  name: string;
  displayName: string;
  availability: Array<{
    date: string;
    dayOfWeek: number;
    slots: string[];
    isToday: boolean;
    scheduleStart: string | null;
    scheduleEnd: string | null;
  }>;
}

export default function CoachingPage() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [language, setLanguage] = useState<Language>('en');
  const [error, setError] = useState('');
  const [coachAvailability, setCoachAvailability] = useState<CoachAvailability[]>([]);

  useEffect(() => {
    initializePage();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLanguage = localStorage.getItem('liff-coaching-language') as Language;
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
        console.log('[DEV MODE] Coaching page loaded without LIFF');
        await fetchAvailability();
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
        await fetchAvailability();
        setViewState('ready');
        return;
      }

      await window.liff.init({ liffId }).catch((err) => {
        console.error('LIFF init error:', err);
        setViewState('ready');
        return;
      });

      await fetchAvailability();
      setViewState('ready');
    } catch (err) {
      console.error('Error initializing page:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize page');
      setViewState('ready');
    }
  };

  const fetchAvailability = async () => {
    try {
      const response = await fetch('/api/coaching/availability?days=14');
      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }
      const data = await response.json();
      setCoachAvailability(data.coaches || []);
    } catch (err) {
      console.error('Error fetching availability:', err);
      // Don't set error state, just continue without availability data
      setCoachAvailability([]);
    }
  };

  const toggleLanguage = () => {
    const newLanguage = language === 'en' ? 'th' : 'en';
    setLanguage(newLanguage);
    if (typeof window !== 'undefined') {
      localStorage.setItem('liff-coaching-language', newLanguage);
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
            <svg
              className="w-16 h-16 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
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
      <CoachingHeader language={language} onLanguageToggle={toggleLanguage} />

      <div className="p-4 space-y-6 pb-24">
        <CoachList language={language} />

        <PricingTable language={language} />

        <SpecialPackages language={language} />

        <AvailabilityPreview language={language} availability={coachAvailability} />
      </div>

      <BookingCTA language={language} />
    </div>
  );
}
