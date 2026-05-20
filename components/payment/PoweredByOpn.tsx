'use client';

import { useTranslations } from 'next-intl';

/**
 * Trust-signal mark shown below the checkout form. Mirrors
 * ShopeepayWordmark's role. No remote logo — uses text + an SSL
 * lock glyph so we never break on Opn's brand-asset CDN.
 */
export function PoweredByOpn() {
  const t = useTranslations('payment.checkout');
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-1">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <span>{t('poweredByLabel')}</span>
      <span className="font-semibold text-gray-700">Opn Payments</span>
    </div>
  );
}
