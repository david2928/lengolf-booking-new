'use client';

import Image from 'next/image';
import { UserIcon } from '@/components/icons';
import GuestForm from '../components/GuestForm';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ProviderButtons } from '@/components/auth/ProviderButtons';

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

/**
 * The standalone login page.
 *
 * DEMOTED, not deleted. The booking flow no longer sends anyone here — sign-in
 * is offered inside the flow as a shortcut, and identity is established at
 * submit from the contact details the customer types anyway. This page remains
 * for the VIP portal, NextAuth's configured `pages.signIn`, the retry link on
 * `/auth/error`, and direct navigation.
 *
 * The provider buttons live in `@/components/auth/ProviderButtons`, shared with
 * the in-flow row, so the two surfaces cannot drift on which providers are
 * offered, in what order, or under what copy. That component also owns the
 * in-app-browser warning and the per-provider gating that PR #90 established.
 */
export default function LoginPage() {
  const t = useTranslations('auth.login');
  const [showGuestForm, setShowGuestForm] = useState(false);
  const searchParams = useSearchParams();
  const error = searchParams?.get('error') || null;
  const callbackUrl = searchParams?.get('callbackUrl') || '/bookings';

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
        {/* Provider gating, ordering, loading state and the in-app-browser
            warning all live in ProviderButtons, shared with the booking flow's
            in-flow sign-in row. */}
        <ProviderButtons callbackUrl={callbackUrl} layout="stacked" />

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
