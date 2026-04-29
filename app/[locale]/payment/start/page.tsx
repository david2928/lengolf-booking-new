'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

/**
 * Payment hand-off page.
 *
 * 1. Reads `?ref=<rental_code>` from the URL.
 * 2. POSTs to /api/payments/shopeepay/create.
 * 3. window.locations to the ShopeePay redirect URL on success.
 *
 * Failure modes:
 *   - Missing ref: show "missing ref" message + back-to-course-rental link.
 *   - 404 from API: show "missing ref" (treat as not-found).
 *   - Other API error / network error: show retry button.
 *
 * The page never displays customer-identifying data — knowing the
 * rental_code is the implicit capability, and the customer who just
 * completed the rental form has it; nobody else does.
 */

type StartState =
  | { kind: 'preparing' }
  | { kind: 'redirecting' }
  | { kind: 'error' }
  | { kind: 'missing-ref' };

export default function PaymentStartPage() {
  const t = useTranslations('payment.start');
  const params = useSearchParams();
  const ref = params?.get('ref') ?? null;
  const [state, setState] = useState<StartState>(() =>
    ref ? { kind: 'preparing' } : { kind: 'missing-ref' }
  );

  // Track attempt count so the retry button creates a NEW
  // payment_reference_id at the API layer (the create endpoint
  // appends an epoch suffix, so each attempt is unique).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ref) return;

    let cancelled = false;
    setState({ kind: 'preparing' });

    const platformType: 'mweb' | 'pc' =
      typeof window !== 'undefined' && window.innerWidth < 768 ? 'mweb' : 'pc';

    const localeMatch = window.location.pathname.match(/^\/(en|th|ko|ja|zh)(\/|$)/);
    const localePrefix = localeMatch ? `/${localeMatch[1]}` : '';
    const returnPath = `${localePrefix}/payment/result`;

    fetch('/api/payments/shopeepay/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rental_code: ref,
        platform_type: platformType,
        return_path: returnPath,
      }),
    })
      .then(async res => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.redirect_url) {
          // 404 means the rental was never found — treat as missing.
          if (res.status === 404) {
            setState({ kind: 'missing-ref' });
            return;
          }
          setState({ kind: 'error' });
          return;
        }
        setState({ kind: 'redirecting' });
        // Small delay so the user briefly sees "redirecting" rather
        // than a flicker. iOS/LIFF sometimes rejects an instant
        // navigate-on-mount as a popup.
        setTimeout(() => {
          window.location.href = data.redirect_url;
        }, 200);
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [ref, attempt]);

  // Build a "back to course rental" URL respecting the current locale.
  const backHref = (() => {
    if (typeof window === 'undefined') return '/course-rental';
    const localeMatch = window.location.pathname.match(/^\/(en|th|ko|ja|zh)(\/|$)/);
    return localeMatch ? `/${localeMatch[1]}/course-rental` : '/course-rental';
  })();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        {state.kind === 'preparing' && (
          <>
            <div className="mx-auto mb-6 w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('preparingTitle')}</h1>
            <p className="text-sm text-gray-600">{t('preparingBody')}</p>
          </>
        )}

        {state.kind === 'redirecting' && (
          <>
            <div className="mx-auto mb-6 w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('preparingTitle')}</h1>
            <p className="text-sm text-gray-600">{t('redirectingBody')}</p>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <div className="mx-auto mb-6 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('errorTitle')}</h1>
            <p className="text-sm text-gray-600 mb-6">{t('errorBody')}</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setAttempt(a => a + 1)}
                className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
              >
                {t('retryCta')}
              </button>
              <a
                href={backHref}
                className="w-full py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
              >
                {t('backCta')}
              </a>
            </div>
          </>
        )}

        {state.kind === 'missing-ref' && (
          <>
            <div className="mx-auto mb-6 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.5M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('errorTitle')}</h1>
            <p className="text-sm text-gray-600 mb-6">{t('missingRefBody')}</p>
            <a
              href={backHref}
              className="block w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
            >
              {t('backCta')}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
