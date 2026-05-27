'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { ShopeepayWordmark } from '@/components/payment/ShopeepayWordmark';
import type { RentalOrderSummary } from '@/lib/shopeepay/order-summary';

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
 * State machine (modern UX — distinct copy per failure reason):
 *   - checking         : poll attempts 1-3 (~7.5s)
 *   - confirming-late  : poll attempts 4+ ("still confirming")
 *   - success          : final terminal — render receipt
 *   - failed-declined  : ShopeePay rejected the charge
 *   - failed-cancelled : user cancelled before completing
 *   - failed-expired   : reservation expired or polling budget hit
 *   - failed-unknown   : generic failure fallback
 *   - missing-ref      : no ?ref or 404 from the API
 */

interface StatusResponse {
  ref: string;
  status: 'unpaid' | 'pending' | 'redirected' | 'success' | 'failed' | 'refunded';
  total_price: number;
  transaction_sn?: string | null;
  paid_at?: string | null;
  failure_reason?: 'declined' | 'cancelled' | 'expired' | 'unknown' | null;
  summary?: RentalOrderSummary | null;
}

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 6;  // 15s total — after that, user almost certainly cancelled
const LATE_THRESHOLD = 3; // after 3 attempts (~7.5s), surface "still confirming" copy

type ViewState =
  | { kind: 'checking'; attempt: number }
  | { kind: 'confirming-late'; attempt: number }
  | { kind: 'success'; data: StatusResponse }
  | { kind: 'failed'; reason: 'declined' | 'cancelled' | 'expired' | 'unknown' }
  | { kind: 'missing-ref' };

export default function PaymentResultPage() {
  const t = useTranslations('payment.result');
  const format = useFormatter();
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
          if (pollCount < MAX_POLLS) {
            timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
          } else {
            setState({ kind: 'failed', reason: 'unknown' });
          }
          return;
        }

        const data = (await res.json()) as StatusResponse;

        if (data.status === 'success') {
          setState({ kind: 'success', data });
          return;
        }
        if (data.status === 'failed') {
          setState({ kind: 'failed', reason: data.failure_reason || 'unknown' });
          return;
        }

        // Still pending. Switch to "confirming-late" copy after the
        // threshold so the user gets reassurance instead of a static
        // spinner.
        const nextKind: 'checking' | 'confirming-late' =
          pollCount >= LATE_THRESHOLD ? 'confirming-late' : 'checking';
        setState({ kind: nextKind, attempt: pollCount });

        if (pollCount < MAX_POLLS) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          // Polling budget exhausted. The most common cause is the user
          // closing ShopeePay before completing payment — show "cancelled"
          // rather than "expired" since that's more accurate and less alarming.
          setState({ kind: 'failed', reason: 'cancelled' });
        }
      } catch {
        if (cancelled) return;
        if (pollCount < MAX_POLLS) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setState({ kind: 'failed', reason: 'unknown' });
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [ref]);

  const retryHref = useMemo(
    () => (ref ? { pathname: '/payment/start' as const, query: { ref } } : '/course-rental'),
    [ref]
  );

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="w-full max-w-md mx-auto">
        {(state.kind === 'checking' || state.kind === 'confirming-late') && (
          <CheckingView state={state} t={t} />
        )}

        {state.kind === 'success' && (
          <SuccessView data={state.data} t={t} format={format} />
        )}

        {state.kind === 'failed' && (
          <FailedView reason={state.reason} ref={ref} retryHref={retryHref} t={t} />
        )}

        {state.kind === 'missing-ref' && <MissingRefView t={t} />}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------
// State views
// ---------------------------------------------------------------------

function CheckingView({
  state,
  t,
}: {
  state: { kind: 'checking' | 'confirming-late'; attempt: number };
  t: ReturnType<typeof useTranslations>;
}) {
  const isLate = state.kind === 'confirming-late';
  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto mb-6 w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      <h1 className="text-xl font-semibold text-gray-900 mb-2">
        {isLate ? t('confirmingLateTitle') : t('checkingTitle')}
      </h1>
      <p className="text-sm text-gray-600">
        {isLate ? t('confirmingLateBody') : t('checkingBody')}
      </p>
    </div>
  );
}

function SuccessView({
  data,
  t,
  format,
}: {
  data: StatusResponse;
  t: ReturnType<typeof useTranslations>;
  format: ReturnType<typeof useFormatter>;
}) {
  const formatDate = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00+07:00`), {
      timeZone: 'Asia/Bangkok',
      month: 'short',
      day: 'numeric',
    });
  const formatPaidAt = (iso: string) =>
    format.dateTime(new Date(iso), {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-green-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('successTitle')}</h1>
        <p className="text-sm text-gray-600">{t('successBody')}</p>
      </div>

      {/* Receipt card — what they paid + transaction details. */}
      <section
        className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5"
        aria-labelledby="receipt-heading"
      >
        <h2 id="receipt-heading" className="sr-only">
          {t('successTitle')}
        </h2>

        {data.summary && (
          <>
            <div className="space-y-3 text-sm">
              {data.summary.club_set_name && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">{t('successClubSetLabel')}</span>
                  <span className="font-medium text-gray-900 text-right">
                    {data.summary.club_set_name}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">{t('successDatesLabel')}</span>
                <span className="font-medium text-gray-900 text-right">
                  {formatDate(data.summary.start_date)} → {formatDate(data.summary.end_date)}
                  <span className="text-gray-500 font-normal">
                    {' '}
                    · {t('successDaysCount', { count: data.summary.duration_days })}
                  </span>
                </span>
              </div>
            </div>
            <hr className="my-4 border-gray-100" />
          </>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">{t('successRentalCodeLabel')}</span>
            <span className="font-mono font-semibold text-gray-900">{data.ref}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">{t('successAmountLabel')}</span>
            <span className="font-bold text-gray-900">
              ฿{format.number(data.total_price)}
            </span>
          </div>
          {data.paid_at && (
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">{t('successPaidAtLabel')}</span>
              <span className="text-gray-700">{formatPaidAt(data.paid_at)}</span>
            </div>
          )}
          {data.transaction_sn && (
            <div className="flex justify-between gap-3 items-baseline">
              <span className="text-gray-500 flex items-center gap-1">
                <ShopeepayWordmark className="text-xs" />
                <span>·</span>
                <span>{t('successTransactionLabel')}</span>
              </span>
              <span className="font-mono text-xs text-gray-600 break-all max-w-[55%]">
                {data.transaction_sn}
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-2 pt-2">
        <Link
          href="/course-rental"
          className="w-full py-3 text-center rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
        >
          {t('newBookingCta')}
        </Link>
        <Link
          href="/"
          className="w-full py-3 text-center rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
        >
          {t('homeCta')}
        </Link>
      </div>
    </div>
  );
}

function FailedView({
  reason,
  ref,
  retryHref,
  t,
}: {
  reason: 'declined' | 'cancelled' | 'expired' | 'unknown';
  ref: string | null;
  retryHref: { pathname: '/payment/start'; query: { ref: string } } | string;
  t: ReturnType<typeof useTranslations>;
}) {
  const titles = {
    declined: t('declinedTitle'),
    cancelled: t('cancelledTitle'),
    expired: t('expiredTitle'),
    unknown: t('failedTitle'),
  } as const;
  const bodies = {
    declined: t('declinedBody'),
    cancelled: t('cancelledBody'),
    expired: t('expiredBody'),
    unknown: t('failedBody'),
  } as const;

  // Retry only makes sense when the failure is recoverable AND we have a ref.
  const canRetry = (reason === 'declined' || reason === 'cancelled' || reason === 'unknown') && !!ref;

  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center"
      role="alert"
    >
      <div
        className={`mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center ${
          reason === 'expired' ? 'bg-gray-100' : 'bg-red-100'
        }`}
      >
        <svg
          className={`w-7 h-7 ${reason === 'expired' ? 'text-gray-500' : 'text-red-600'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {reason === 'expired' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          )}
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{titles[reason]}</h1>
      <p className="text-sm text-gray-600 mb-6">{bodies[reason]}</p>
      <div className="flex flex-col gap-2">
        {canRetry && (
          <Link
            href={retryHref}
            className="w-full py-3 text-center rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
          >
            {t('retryCta')}
          </Link>
        )}
        <Link
          href="/course-rental"
          className="w-full py-3 text-center rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
        >
          {t('newBookingCta')}
        </Link>
        {reason === 'declined' && (
          <a
            href="https://lin.ee/uxQpIXn"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 text-center rounded-xl font-semibold text-[#06C755] bg-white border border-[#06C755] hover:bg-[#06C755]/5"
          >
            {t('contactLineCta')}
          </a>
        )}
      </div>
    </div>
  );
}

function MissingRefView({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
      <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
        <svg
          className="w-7 h-7 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('expiredTitle')}</h1>
      <p className="text-sm text-gray-600 mb-6">{t('expiredBody')}</p>
      <Link
        href="/course-rental"
        className="block w-full py-3 text-center rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700"
      >
        {t('newBookingCta')}
      </Link>
    </div>
  );
}
