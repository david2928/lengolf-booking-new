'use client';

import Image from 'next/image';
import { UserIcon } from '@/components/icons';
import GuestForm from '../components/GuestForm';
import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { FaLine, FaFacebook } from 'react-icons/fa';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { detectInAppBrowser, blocksGoogleOAuth, type InAppBrowser } from '@/lib/in-app-browser';

/**
 * Map a NextAuth `?error=` code to a translation key. Anything we don't
 * recognise falls through to `errorDefault` — previously an unknown code
 * rendered an empty red box, which reads as a glitch rather than an error.
 */
const ERROR_MESSAGE_KEYS = {
  OAuthSignin: 'errorOAuthSignin',
  OAuthCallback: 'errorOAuthCallback',
  OAuthCreateAccount: 'errorOAuthCreateAccount',
  EmailCreateAccount: 'errorEmailCreateAccount',
  OAuthAccountNotLinked: 'errorAccountNotLinked',
  AccessDenied: 'errorAccessDenied',
  Configuration: 'errorConfiguration',
  Verification: 'errorVerification',
  SessionRequired: 'errorSessionRequired',
  Callback: 'errorCallback',
  Default: 'errorDefault',
} as const;

function errorMessageKey(code: string | null) {
  if (code && code in ERROR_MESSAGE_KEYS) {
    return ERROR_MESSAGE_KEYS[code as keyof typeof ERROR_MESSAGE_KEYS];
  }
  return 'errorDefault' as const;
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [browserType, setBrowserType] = useState<InAppBrowser>(null);
  const searchParams = useSearchParams();
  const error = searchParams?.get('error') || null;
  const callbackUrl = searchParams?.get('callbackUrl') || '/bookings';

  useEffect(() => {
    setBrowserType(detectInAppBrowser(navigator.userAgent));
  }, []);

  // Which providers can actually succeed here. Google is dropped inside every
  // embedded WebView because Google itself refuses the request
  // (`disallowed_useragent`) — offering the button just dead-ends the customer.
  // Inside the LINE or Facebook app we keep the existing behaviour of offering
  // only that app's own provider — it is the one guaranteed to work there.
  const showGoogle = !blocksGoogleOAuth(browserType);
  const showFacebook = browserType !== 'line';
  const showLine = browserType !== 'facebook';

  // Once a sign-in has already failed, guest stops being the fallback and
  // becomes the recommendation — it's the one path that has no third party in
  // it and therefore cannot fail the same way.
  const promoteGuest = error !== null;

  const guestButton = (
    <button
      type="button"
      onClick={() => setShowGuestForm(true)}
      className={
        promoteGuest
          ? 'flex w-full items-center justify-center rounded-lg bg-[#005a32] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#004526] focus:outline-none'
          : 'flex w-full items-center justify-center rounded-lg bg-gray-800 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700 focus:outline-none'
      }
    >
      <UserIcon className="mr-3 h-5 w-5" />
      {t('continueAsGuest')}
    </button>
  );

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
      {/* Language switcher — anonymous users can pick a language before signing in */}
      <div className="absolute top-3 right-3">
        <LanguageSwitcher variant="light" />
      </div>

      <div className="flex flex-col items-center justify-center">
        <div className="relative w-[180px] h-[60px] mb-8">
          <Image
            src="/images/logo_v1.png"
            alt={t('logoAlt')}
            fill
            priority
            sizes="180px"
            className="object-contain"
          />
        </div>
        <h2 className="text-center text-2xl font-bold text-gray-900 mb-3">
          {t('welcomeHeading')}
        </h2>
        <p className="text-center text-sm text-gray-600 mb-8">
          {t('welcomeSubheading')}
        </p>
      </div>

      {/* Browser Warning */}
      {browserType !== null && (
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
          {t(errorMessageKey(error))}
        </div>
      )}

      {/* After a failed sign-in, lead with guest rather than burying it below
          the providers the customer has just watched fail. */}
      {promoteGuest && (
        <div className="mb-6 rounded-lg border border-[#005a32]/30 bg-[#005a32]/5 p-4">
          <p className="text-sm font-medium text-gray-900">{t('guestNudgeTitle')}</p>
          <p className="mt-1 mb-4 text-sm text-gray-600">{t('guestNudgeBody')}</p>
          {guestButton}
        </div>
      )}

      <div className="space-y-4">
        {/* Providers, filtered to the ones that can succeed in this browser. */}
        {showGoogle && (
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
                  {t('continueWithGoogle')}
                </>
              )}
            </button>
        )}

        {showFacebook && (
            <button
              onClick={() => handleProviderSignIn('facebook')}
              disabled={loadingProvider !== null}
              className="flex w-full items-center justify-center rounded-lg bg-[#1877F2] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#166FE5] focus:outline-none disabled:opacity-50 disabled:cursor-wait"
            >
              {loadingProvider === 'facebook' ? (
                <LoadingSpinner />
              ) : (
                <>
                  <FaFacebook className="text-lg mr-3" />
                  {t('continueWithFacebook')}
                </>
              )}
            </button>
        )}

        {showLine && (
            <button
              onClick={() => handleProviderSignIn('line')}
              disabled={loadingProvider !== null}
              className="flex w-full items-center justify-center rounded-lg bg-[#00B900] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#00A000] focus:outline-none disabled:opacity-50 disabled:cursor-wait"
            >
              {loadingProvider === 'line' ? (
                <LoadingSpinner />
              ) : (
                <>
                  <FaLine className="text-lg mr-3" />
                  {t('continueWithLine')}
                </>
              )}
            </button>
        )}

        {/* Guest entry point in its normal position. Suppressed when the error
            banner has already promoted it above, so it never appears twice. */}
        {!promoteGuest && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-6 text-gray-500">{t('dividerOr')}</span>
              </div>
            </div>
            {guestButton}
          </>
        )}
      </div>

      {showGuestForm && (
        <GuestForm callbackUrl={callbackUrl} onClose={() => setShowGuestForm(false)} />
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