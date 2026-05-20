'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

/**
 * Client island for Opn card-form tokenization.
 *
 * State machine:
 *   idle -> submitting -> (success | 3ds-redirect | declined | tokenize-error)
 *
 * On mount: inject https://cdn.omise.co/omise.js once, wait for
 * window.Omise, set ready=true. Submit triggers Omise.createToken
 * which posts the card directly to Opn's servers (PCI SAQ-A — card
 * never touches our backend), then POSTs the resulting tokn_* to
 * /api/payments/opn/intent.
 */

declare global {
  interface Window {
    Omise?: {
      setPublicKey: (key: string) => void;
      createToken: (
        type: 'card',
        card: {
          name: string;
          number: string;
          expiration_month: number;
          expiration_year: number;
          security_code: string;
        },
        callback: (statusCode: number, response: { id?: string; code?: string }) => void
      ) => void;
    };
  }
}

const OMISE_JS_URL = 'https://cdn.omise.co/omise.js';

interface PayElementProps {
  rentalCode: string;
  amount: number;       // THB
  publicKey: string;    // pkey_*
  locale: string;
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'tokenize-error'; code: string };

export function PayElement({ rentalCode, amount, publicKey }: PayElementProps) {
  const t = useTranslations('payment.checkout');
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [exp, setExp] = useState('');
  const [cvv, setCvv] = useState('');
  const [state, setState] = useState<ViewState>({ kind: 'idle' });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.Omise) {
      setReady(true);
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${OMISE_JS_URL}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = OMISE_JS_URL;
      script.async = true;
      document.head.appendChild(script);
    }
    const onLoad = () => setReady(!!window.Omise);
    script.addEventListener('load', onLoad);
    return () => script?.removeEventListener('load', onLoad);
  }, []);

  const parsedExp = useMemo(() => {
    const match = exp.match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (!match) return null;
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) return null;
    return { month, year };
  }, [exp]);

  const numberDigits = number.replace(/\s+/g, '');
  const isValidForm = Boolean(
    name.trim() &&
    numberDigits.length >= 13 && numberDigits.length <= 19 &&
    parsedExp &&
    cvv.length >= 3 && cvv.length <= 4
  );

  const submit = useCallback(() => {
    if (!ready || !window.Omise || !parsedExp) return;
    setState({ kind: 'submitting' });
    window.Omise.setPublicKey(publicKey);
    window.Omise.createToken(
      'card',
      {
        name,
        number: numberDigits,
        expiration_month: parsedExp.month,
        expiration_year: parsedExp.year,
        security_code: cvv,
      },
      async (statusCode, response) => {
        if (statusCode !== 200 || !response?.id) {
          setState({ kind: 'tokenize-error', code: response?.code || 'tokenize_failed' });
          return;
        }
        try {
          const r = await fetch('/api/payments/opn/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rental_code: rentalCode, token: response.id }),
          });
          const data = await r.json();
          if (data.status === 'requires_3ds' && data.authorize_uri) {
            window.location.href = data.authorize_uri;
            return;
          }
          if (data.status === 'success') {
            router.push(`/payment/return?ref=${rentalCode}`);
            return;
          }
          setState({ kind: 'tokenize-error', code: data.failure_reason || 'unknown' });
        } catch {
          setState({ kind: 'tokenize-error', code: 'network_error' });
        }
      }
    );
  }, [ready, publicKey, name, numberDigits, parsedExp, cvv, rentalCode, router]);

  const submitting = state.kind === 'submitting';
  const errorCode = state.kind === 'tokenize-error' ? state.code : null;

  return (
    <form
      className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="cc-name">
          {t('nameLabel')}
        </label>
        <input
          id="cc-name"
          type="text"
          autoComplete="cc-name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-base"
          required
          disabled={submitting}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="cc-number">
          {t('numberLabel')}
        </label>
        <input
          id="cc-number"
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          value={number}
          onChange={e => setNumber(e.target.value)}
          placeholder="•••• •••• •••• ••••"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-base font-mono"
          required
          disabled={submitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="cc-exp">
            {t('expLabel')}
          </label>
          <input
            id="cc-exp"
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            value={exp}
            onChange={e => setExp(e.target.value)}
            placeholder="MM/YY"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-base font-mono"
            required
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="cc-cvv">
            {t('cvvLabel')}
          </label>
          <input
            id="cc-cvv"
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            value={cvv}
            onChange={e => setCvv(e.target.value.replace(/[^\d]/g, ''))}
            maxLength={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-base font-mono"
            required
            disabled={submitting}
          />
        </div>
      </div>

      {errorCode && (
        <div role="alert" aria-live="polite" className="text-sm text-red-600 py-1">
          {t('errorMessage', { code: errorCode })}
        </div>
      )}

      <button
        type="submit"
        disabled={!ready || !isValidForm || submitting}
        className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {submitting ? t('submittingCta') : t('payCta', { amount: `฿${amount.toLocaleString()}` })}
      </button>
    </form>
  );
}
