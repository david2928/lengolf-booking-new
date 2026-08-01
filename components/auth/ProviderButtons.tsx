'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { FaLine, FaFacebook } from 'react-icons/fa';
import { detectInAppBrowser, blocksGoogleOAuth, type InAppBrowser } from '@/lib/in-app-browser';

/**
 * The OAuth provider buttons, shared by `/auth/login` and the in-flow sign-in
 * row on the booking details step.
 *
 * One component on purpose. These two surfaces must agree on which providers
 * are offered, in what order, and under what copy — and the rules for that are
 * not obvious enough to be re-derived correctly a second time:
 *
 *  - Google is dropped inside EVERY embedded WebView, because Google itself
 *    refuses the request (`disallowed_useragent`). Offering the button there
 *    dead-ends the customer with no server-side trace, which is exactly the
 *    failure that produced PR #90.
 *  - Inside the LINE or Facebook app, only that app's own provider is offered —
 *    it is the one guaranteed to work in its own WebView.
 *  - LINE never leads. `middleware.ts` redirects LINE-UA traffic to
 *    `/liff/booking`, so the LINE button here only ever serves desktop LINE
 *    users. It stays available, but it is not the first thing anyone sees.
 *
 * Detection runs in an effect (`navigator` is client-only), so the FIRST paint
 * always shows all three and then settles. Callers that render this above form
 * fields must reserve height for the full set — see `minHeightClass` — or the
 * settle shifts the fields under a thumb mid-tap.
 */

export type ProviderId = 'google' | 'facebook' | 'line';

interface ProviderButtonsProps {
  /**
   * Where to return after the round trip.
   *
   * MUST NOT carry query parameters when returning into the booking flow:
   * `useBookingFlow` treats the presence of `selectDate`/`package`/`club` as a
   * deep link and skips its sessionStorage restore entirely, which would
   * silently discard the in-progress booking. Build it with
   * `getPathname({ href, locale })`, not by hand.
   */
  callbackUrl: string;
  /**
   * `stacked` — full-width buttons, one per row (the login page).
   * `compact` — same buttons, tighter padding, for use inside a form card.
   */
  layout?: 'stacked' | 'compact';
  /**
   * Fired before the redirect. The in-flow row uses this to persist the
   * customer's typed contact details, which a full-document navigation would
   * otherwise destroy. Kept synchronous — anything async here races the
   * redirect and will not reliably complete.
   */
  onBeforeSignIn?: (provider: ProviderId) => void;
  /** Reserve vertical space so the post-hydration settle cannot shift layout. */
  minHeightClass?: string;
}

export function ProviderButtons({
  callbackUrl,
  layout = 'stacked',
  onBeforeSignIn,
  minHeightClass,
}: ProviderButtonsProps) {
  const t = useTranslations('auth.login');
  const [browserType, setBrowserType] = useState<InAppBrowser>(null);
  const [loadingProvider, setLoadingProvider] = useState<ProviderId | null>(null);

  useEffect(() => {
    setBrowserType(detectInAppBrowser(navigator.userAgent));
  }, []);

  // Reset the spinner when the customer navigates back — otherwise a button
  // left mid-redirect stays disabled and the row looks broken.
  useEffect(() => {
    const handlePopState = () => setLoadingProvider(null);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      setLoadingProvider(null);
    };
  }, []);

  const showGoogle = !blocksGoogleOAuth(browserType);
  const showFacebook = browserType !== 'line';
  const showLine = browserType !== 'facebook';

  const handleSignIn = async (provider: ProviderId) => {
    onBeforeSignIn?.(provider);
    setLoadingProvider(provider);
    try {
      await signIn(provider, { callbackUrl });
    } catch (err) {
      console.error('Sign in error:', err);
      setLoadingProvider(null);
    }
  };

  const pad = layout === 'compact' ? 'px-4 py-2.5' : 'px-4 py-3';
  const base = `flex w-full items-center justify-center rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-wait ${pad}`;

  const Spinner = () => (
    <span className="flex items-center justify-center">
      <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      <span>{t('connecting')}</span>
    </span>
  );

  return (
    <div className={`space-y-3 ${minHeightClass ?? ''}`}>
      {browserType !== null && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{t('browserWarning')}</span>
          </div>
        </div>
      )}

      {showGoogle && (
        <button
          type="button"
          onClick={() => handleSignIn('google')}
          disabled={loadingProvider !== null}
          className={`${base} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-400`}
        >
          {loadingProvider === 'google' ? (
            <Spinner />
          ) : (
            <>
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {t('continueWithGoogle')}
            </>
          )}
        </button>
      )}

      {showFacebook && (
        <button
          type="button"
          onClick={() => handleSignIn('facebook')}
          disabled={loadingProvider !== null}
          className={`${base} bg-[#1877F2] text-white hover:bg-[#166FE5] focus-visible:ring-[#1877F2]`}
        >
          {loadingProvider === 'facebook' ? (
            <Spinner />
          ) : (
            <>
              <FaFacebook className="text-lg mr-3" aria-hidden="true" />
              {t('continueWithFacebook')}
            </>
          )}
        </button>
      )}

      {showLine && (
        <button
          type="button"
          onClick={() => handleSignIn('line')}
          disabled={loadingProvider !== null}
          className={`${base} bg-[#00B900] text-white hover:bg-[#00A000] focus-visible:ring-[#00B900]`}
        >
          {loadingProvider === 'line' ? (
            <Spinner />
          ) : (
            <>
              <FaLine className="text-lg mr-3" aria-hidden="true" />
              {t('continueWithLine')}
            </>
          )}
        </button>
      )}
    </div>
  );
}
