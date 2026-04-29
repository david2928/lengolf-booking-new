'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

/**
 * Payment result page.
 *
 * Customer lands here after returning from ShopeePay (the gateway's
 * `return_url` points here). Per the ShopeePay UAT contract:
 *
 *   "Redirect to return_url should NEVER be used as an indication of
 *    payment success."
 *
 * So this page polls our own /api/payments/shopeepay/status, which
 * itself falls back to ShopeePay's /transaction/check when the
 * webhook hasn't arrived yet.
 *
 * Polling cadence: 2.5s × up to 12 attempts (= 30s). After that, we
 * stop polling and show the latest known state. The user can refresh
 * if they want to keep waiting.
 */

interface StatusResponse {
  ref: string;
  status: 'unpaid' | 'pending' | 'redirected' | 'success' | 'failed' | 'refunded';
  total_price: number;
  transaction_sn?: string | null;
  paid_at?: string | null;
}

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 12;

type ViewState =
  | { kind: 'checking'; attempt: number }
  | { kind: 'success'; data: StatusResponse }
  | { kind: 'failed'; reason: 'failed' | 'expired' }
  | { kind: 'missing-ref' };

export default function PaymentResultPage() {
  const t = useTranslations('payment.result');
  const params = useSearchParams();
  const ref = params?.get('ref') ?? null;

  const [state, setState] = useState<ViewState>(() =>
    ref ? { kind: 'checking', attempt: 0 } : { kind: 'missing-ref' }
  );

  useEffect(() => {
    if (!ref) return;

    let cancelled = false;
    let pollCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      pollCount += 1;

      try {
        const res = await fetch(
          `/api/payments/shopeepay/status?ref=${encodeURIComponent(ref)}`,
          { cache: 'no-store' }
        );
        if (cancelled) return;

        if (res.status === 404) {
          setState({ kind: 'missing-ref' });
          return;
        }
        if (!res.ok) {
          // Transient error — keep polling within the budget.
          if (pollCount < MAX_POLLS) {
            timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
          } else {
            setState({ kind: 'failed', reason: 'failed' });
          }
          return;
        }

        const data = (await res.json()) as StatusResponse;

        if (data.status === 'success') {
          setState({ kind: 'success', data });
          return;
        }
        if (data.status === 'failed') {
          setState({ kind: 'failed', reason: 'failed' });
          return;
        }

        // Still pending. Keep polling within budget.
        setState({ kind: 'checking', attempt: pollCount });
        if (pollCount < MAX_POLLS) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          // Budget exhausted — treat as expired so the user gets a
          // clear next action. The cron will eventually clean up.
          setState({ kind: 'failed', reason: 'expired' });
        }
      } catch {
        if (cancelled) return;
        if (pollCount < MAX_POLLS) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setState({ kind: 'failed', reason: 'failed' });
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [ref]);

  // Locale-aware navigation links.
  const localePrefix = (() => {
    if (typeof window === 'undefined') return '';
    const m = window.location.pathname.match(/^\/(en|th|ko|ja|zh)(\/|$)/);
    return m ? `/${m[1]}` : '';
  })();
  const courseRentalHref = `${localePrefix}/course-rental`;
  const homeHref = `${localePrefix}/`;
  const retryHref = ref ? `${localePrefix}/payment/start?ref=${encodeURIComponent(ref)}` : courseRentalHref;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        {state.kind === 'checking' && (
          <div className="text-center">
            <div className="mx-auto mb-6 w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('checkingTitle')}</h1>
            <p className="text-sm text-gray-600">{t('checkingBody')}</p>
          </div>
        )}

        {state.kind === 'success' && (
          <div>
            <div className="text-center mb-6">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('successTitle')}</h1>
              <p className="text-sm text-gray-600">{t('successBody')}</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-4 text-left text-sm">
              <p className="text-gray-500 text-xs">{t('successRentalCodeLabel')}</p>
              <p className="font-mono font-semibold text-gray-900 text-base mt-0.5">
                {state.data.ref}
              </p>
              {state.data.transaction_sn && (
                <>
                  <p className="text-gray-500 text-xs mt-3">{t('successTransactionLabel')}</p>
                  <p className="font-mono text-gray-700 text-xs mt-0.5 break-all">
                    {state.data.transaction_sn}
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <a
                href={courseRentalHref}
                className="w-full py-3 text-center rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
              >
                {t('newBookingCta')}
              </a>
              <a
                href={homeHref}
                className="w-full py-3 text-center rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
              >
                {t('homeCta')}
              </a>
            </div>
          </div>
        )}

        {state.kind === 'failed' && (
          <div className="text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              {state.reason === 'expired' ? t('expiredTitle') : t('failedTitle')}
            </h1>
            <p className="text-sm text-gray-600 mb-6">
              {state.reason === 'expired' ? t('expiredBody') : t('failedBody')}
            </p>
            <div className="flex flex-col gap-2">
              {state.reason === 'failed' && ref && (
                <a
                  href={retryHref}
                  className="w-full py-3 text-center rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
                >
                  {t('retryCta')}
                </a>
              )}
              <a
                href={courseRentalHref}
                className="w-full py-3 text-center rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
              >
                {t('newBookingCta')}
              </a>
            </div>
          </div>
        )}

        {state.kind === 'missing-ref' && (
          <div className="text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('expiredTitle')}</h1>
            <p className="text-sm text-gray-600 mb-6">{t('expiredBody')}</p>
            <a
              href={courseRentalHref}
              className="block w-full py-3 text-center rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
            >
              {t('newBookingCta')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
