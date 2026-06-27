'use client';

import { useTranslations } from 'next-intl';

const ROWS = ['trip', 'discount', 'set', 'quality', 'pick', 'delivery'] as const;

/**
 * "Why rent with LENGOLF vs. at the course" comparison on the course-rental
 * landing. Substantiated by the June 2026 pricing research: courses charge per
 * round with no multi-day discount, so LENGOLF wins decisively for the typical
 * multi-round tourist. The honest footnote concedes single-round trips.
 */
export function WhyRentSection() {
  const t = useTranslations('courseRental.whyRent');

  return (
    <section className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: '#F6FFFA', border: '1px solid #cfe8da' }}>
      <h2 className="text-lg font-bold text-gray-900 sm:text-xl">{t('heading')}</h2>
      <p className="mt-1 text-sm font-semibold" style={{ color: '#007429' }}>{t('savingsHeadline')}</p>

      <div
        className="mt-4 overflow-hidden rounded-xl border bg-white text-xs sm:text-sm"
        style={{ borderColor: '#e4f0e9' }}
      >
        <div className="grid grid-cols-[1.1fr_1fr_1fr]">
          <div className="px-3 py-2" />
          <div className="px-3 py-2 text-center font-bold text-white" style={{ backgroundColor: '#005a32' }}>
            LENGOLF
          </div>
          <div className="bg-gray-50 px-3 py-2 text-center font-semibold text-gray-500">
            {t('colCourse')}
          </div>
        </div>
        {ROWS.map(key => (
          <div key={key} className="grid grid-cols-[1.1fr_1fr_1fr] border-t" style={{ borderColor: '#eef3f0' }}>
            <div className="px-3 py-2.5 font-medium text-gray-700">{t(`rows.${key}.label`)}</div>
            <div className="px-3 py-2.5 font-medium" style={{ backgroundColor: '#F6FFFA', color: '#005a32' }}>
              {t(`rows.${key}.lengolf`)}
            </div>
            <div className="px-3 py-2.5 text-gray-500">{t(`rows.${key}.course`)}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-400">{t('footnote')}</p>
    </section>
  );
}
