'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * Client island that handles the ShopeePay create + redirect.
 * The order summary is rendered server-side above this — the customer
 * sees what they're paying before this component does any work.
 *
 * Lifecycle:
 *   1. On mount → POST /api/payments/shopeepay/create
 *   2. On success → setState('redirecting') → window.location.href
 *      after a short delay so the customer reads "Redirecting…"
 *   3. On error → render retry / back buttons
 *
 * The 200ms redirect delay is also a guard against iOS/LIFF rejecting
 * an instant navigate-on-mount as a popup.
 */

type HandoffState =
  | { kind: 'connecting' }
  | { kind: 'redirecting' }
  | { kind: 'error' };

export function HandoffClient({ rentalCode }: { rentalCode: string }) {
  const t = useTranslations('payment.start');
  const [state, setState] = useState<HandoffState>({ kind: 'connecting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'connecting' });

    const platformType: 'mweb' | 'pc' =
      typeof window !== 'undefined' && window.innerWidth < 768 ? 'mweb' : 'pc';

    const localeMatch = window.location.pathname.match(/^\/(en|th|ko|ja|zh)(\/|$)/);
    const localePrefix = localeMatch ? `/${localeMatch[1]}` : '';
    const returnPath = `${localePrefix}/payment/result`;

    fetch('/api/payments/shopeepay/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rental_code: rentalCode,
        platform_type: platformType,
        return_path: returnPath,
      }),
    })
      .then(async res => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.redirect_url) {
          setState({ kind: 'error' });
          return;
        }
        setState({ kind: 'redirecting' });
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
  }, [rentalCode, attempt]);

  if (state.kind === 'error') {
    return (
      <div
        className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center"
        role="alert"
      >
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-amber-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z"
            />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">{t('errorTitle')}</h2>
        <p className="text-sm text-gray-600 mb-5">{t('errorBody')}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setAttempt(a => a + 1)}
            className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
          >
            {t('retryCta')}
          </button>
          <Link
            href="/course-rental"
            className="w-full py-3 text-center rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
          >
            {t('backCta')}
          </Link>
        </div>
      </div>
    );
  }

  // Connecting + Redirecting share the same shell — only the body copy changes.
  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto mb-4 w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      <h2 className="text-base font-semibold text-gray-900 mb-1">{t('preparingTitle')}</h2>
      <p className="text-sm text-gray-600">
        {state.kind === 'redirecting' ? t('redirectingBody') : t('preparingBody')}
      </p>
    </div>
  );
}
