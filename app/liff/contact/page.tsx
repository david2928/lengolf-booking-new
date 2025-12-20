'use client';

import { useEffect, useState } from 'react';
import { Language } from '@/lib/liff/translations';
import ContactHeader from '@/components/liff/contact/ContactHeader';
import ContactCard from '@/components/liff/contact/ContactCard';
import GoogleMapsEmbed from '@/components/liff/contact/GoogleMapsEmbed';
import GettingHere from '@/components/liff/contact/GettingHere';
import OpeningHours from '@/components/liff/contact/OpeningHours';
import SocialLinks from '@/components/liff/contact/SocialLinks';

type ViewState = 'loading' | 'error' | 'ready';

export default function ContactPage() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [language, setLanguage] = useState<Language>('en');
  const [error, setError] = useState('');

  useEffect(() => {
    initializePage();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLanguage = localStorage.getItem('liff-contact-language') as Language;
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
        console.log('[DEV MODE] Contact page loaded without LIFF');
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

      const liffId = process.env.NEXT_PUBLIC_LIFF_CONTACT_ID;
      if (!liffId || liffId === 'your-liff-id-here') {
        console.log('[Contact] LIFF ID not configured - running without LIFF features');
        setViewState('ready');
        return;
      }

      await window.liff.init({ liffId }).catch((err) => {
        console.warn('[Contact] LIFF init failed - continuing without LIFF features:', err);
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
      localStorage.setItem('liff-contact-language', newLanguage);
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
      <ContactHeader language={language} onLanguageToggle={toggleLanguage} />

      <div className="p-4 space-y-4 pb-8">
        <div className="grid grid-cols-1 gap-4">
          <ContactCard
            icon={
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            }
            title={language === 'en' ? 'Call Us' : 'โทรหาเรา'}
            value="096-668-2335"
            actionLabel={language === 'en' ? 'Call Now' : 'โทรเลย'}
            actionHref="tel:+66966682335"
          />

          <ContactCard
            icon={
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            title={language === 'en' ? 'Email Us' : 'อีเมล'}
            value="info@len.golf"
            actionLabel={language === 'en' ? 'Send Email' : 'ส่งอีเมล'}
            actionHref="mailto:info@len.golf"
          />
        </div>

        <GoogleMapsEmbed language={language} />

        <GettingHere language={language} />

        <OpeningHours language={language} />

        <SocialLinks language={language} />
      </div>
    </div>
  );
}
