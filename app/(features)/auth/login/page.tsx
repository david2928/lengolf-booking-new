'use client';

import Image from 'next/image';
import { UserIcon } from '@/components/icons';
import GuestForm from '../components/GuestForm';
import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

function LoginPageContent() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [browserType, setBrowserType] = useState<'line' | 'facebook' | 'other'>('other');
  const searchParams = useSearchParams();
  const error = searchParams?.get('error') || null;
  const callbackUrl = searchParams?.get('callbackUrl') || '/bookings';

  useEffect(() => {
    // Function to detect browser type
    const detectBrowser = () => {
      const ua = navigator.userAgent.toLowerCase();
      
      // LINE browser detection
      if (ua.includes('line/') || ua.includes('line ')) {
        return 'line';
      }
      
      // Facebook browser detection
      if (ua.includes('fban/') || ua.includes('fbav/') || ua.includes('fbios/')) {
        return 'facebook';
      }

      // Other browsers
      return 'other';
    };

    setBrowserType(detectBrowser());
  }, []);

  // Reset loading state when component unmounts or user navigates back
  useEffect(() => {
    const handlePopState = () => {
      setLoadingProvider(null);
    };

    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      setLoadingProvider(null);
    };
  }, []);

  const handleProviderSignIn = async (provider: string) => {
    setLoadingProvider(provider);
    try {
      // Let NextAuth handle the redirect for all providers
      // The redirect callback in NextAuth options will preserve language parameters
      await signIn(provider, { callbackUrl });
    } catch (error) {
      console.error('Sign in error:', error);
      setLoadingProvider(null);
    }
  };

  const LoadingSpinner = () => (
    <div className="flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
      <span>{t('connecting')}</span>
    </div>
  );

  return (
    <div className="w-full max-w-md px-6 py-12 bg-white rounded-lg shadow-sm relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="flex flex-col items-center justify-center">
        <div className="relative w-[180px] h-[60px] mb-8">
          <Image
            src="/images/logo_v1.png"
            alt="LENGOLF Logo"
            fill
            priority
            sizes="180px"
            className="object-contain"
          />
        </div>
        <h2 className="text-center text-2xl font-bold text-gray-900 mb-3">
          {t('welcomeToLengolf')}
        </h2>
        <p className="text-center text-sm text-gray-600 mb-8">
          {t('loginPrompt')}
        </p>
      </div>

      {/* Browser Warning */}
      {browserType !== 'other' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2 text-amber-800">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5 mt-0.5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{t('browserWarning')}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 text-sm text-red-800 bg-red-100 rounded-lg">
          {error === 'OAuthSignin' && t('errors.oauthSignin')}
          {error === 'OAuthCallback' && t('errors.oauthCallback')}
          {error === 'OAuthCreateAccount' && t('errors.oauthCreateAccount')}
          {error === 'EmailCreateAccount' && t('errors.emailCreateAccount')}
          {error === 'Callback' && t('errors.callback')}
          {error === 'Default' && t('errors.default')}
        </div>
      )}

      <div className="space-y-4">
        {/* Show login options based on browser type */}
        {browserType === 'line' ? (
          // LINE browser: Show only LINE login
          <button
            onClick={() => handleProviderSignIn('line')}
            disabled={loadingProvider !== null}
            className="flex w-full items-center justify-center rounded-lg bg-[#00B900] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#00A000] focus:outline-none disabled:opacity-50 disabled:cursor-wait"
          >
            {loadingProvider === 'line' ? (
              <LoadingSpinner />
            ) : (
              <>
                <i className="fab fa-line text-lg mr-3"></i>
                {t('continueWith', { provider: 'LINE' })}
              </>
            )}
          </button>
        ) : browserType === 'facebook' ? (
          // Facebook browser: Show only Facebook login
          <button
            onClick={() => handleProviderSignIn('facebook')}
            disabled={loadingProvider !== null}
            className="flex w-full items-center justify-center rounded-lg bg-[#1877F2] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#166FE5] focus:outline-none disabled:opacity-50 disabled:cursor-wait"
          >
            {loadingProvider === 'facebook' ? (
              <LoadingSpinner />
            ) : (
              <>
                <i className="fab fa-facebook text-lg mr-3"></i>
                {t('continueWith', { provider: 'Facebook' })}
              </>
            )}
          </button>
        ) : (
          // Normal browser: Show all login options
          <>
            <button
              onClick={() => handleProviderSignIn('google')}
              disabled={loadingProvider !== null}
              className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none disabled:opacity-50 disabled:cursor-wait"
            >
              {loadingProvider === 'google' ? (
                <LoadingSpinner />
              ) : (
                <>
                  <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  {t('continueWith', { provider: 'Google' })}
                </>
              )}
            </button>

            <button
              onClick={() => handleProviderSignIn('facebook')}
              disabled={loadingProvider !== null}
              className="flex w-full items-center justify-center rounded-lg bg-[#1877F2] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#166FE5] focus:outline-none disabled:opacity-50 disabled:cursor-wait"
            >
              {loadingProvider === 'facebook' ? (
                <LoadingSpinner />
              ) : (
                <>
                  <i className="fab fa-facebook text-lg mr-3"></i>
                  {t('continueWith', { provider: 'Facebook' })}
                </>
              )}
            </button>

            <button
              onClick={() => handleProviderSignIn('line')}
              disabled={loadingProvider !== null}
              className="flex w-full items-center justify-center rounded-lg bg-[#00B900] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#00A000] focus:outline-none disabled:opacity-50 disabled:cursor-wait"
            >
              {loadingProvider === 'line' ? (
                <LoadingSpinner />
              ) : (
                <>
                  <i className="fab fa-line text-lg mr-3"></i>
                  {t('continueWith', { provider: 'LINE' })}
                </>
              )}
            </button>
          </>
        )}

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-6 text-gray-500">{t('or')}</span>
          </div>
        </div>

        {/* Guest Login Button */}
        <button
          type="button"
          onClick={() => setShowGuestForm(true)}
          className="flex w-full items-center justify-center rounded-lg bg-gray-800 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700 focus:outline-none"
        >
          <UserIcon className="mr-3 h-5 w-5" />
          {t('continueAsGuest')}
        </button>
      </div>

      {showGuestForm && (
        <GuestForm onClose={() => setShowGuestForm(false)} />
      )}

      {/* Privacy Policy Link */}
      <div className="mt-8 text-center">
        <a 
          href="https://www.len.golf/privacy-policy/" 
          onClick={(e) => {
            e.preventDefault();
            const cleanUrl = 'https://www.len.golf/privacy-policy/';
            window.open(cleanUrl, '_blank', 'noopener,noreferrer');
          }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {t('privacyPolicy')}
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-gray-50 to-white">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="relative mx-auto w-[200px] h-[67px]">
              <Image
                src="/images/logo_v1.png"
                alt="LENGOLF Logo"
                fill
                priority
                sizes="200px"
                className="object-contain"
              />
            </div>
            <div className="mt-6">
              <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
} 