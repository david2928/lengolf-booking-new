'use client';

import { Language } from '@/lib/liff/translations';
import { bookingTranslations } from '@/lib/liff/booking-translations';

interface BookingHeaderProps {
  language: Language;
  onLanguageToggle: () => void;
  onBack?: () => void;
  showBack?: boolean;
}

export default function BookingHeader({
  language,
  onLanguageToggle,
  onBack,
  showBack = false
}: BookingHeaderProps) {
  const t = bookingTranslations[language];

  return (
    <header className="bg-primary text-primary-foreground py-4 sticky top-0 z-50 shadow-md">
      <div className="px-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {showBack && onBack && (
              <button
                onClick={onBack}
                className="p-2 -ml-2 text-white/80 hover:text-white active:bg-white/10 rounded-full transition-colors"
                aria-label={t.back}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h1 className="text-2xl font-bold text-white">
              {t.title}
            </h1>
          </div>

          <button
            onClick={onLanguageToggle}
            className="flex items-center gap-1.5 bg-white text-primary px-3 py-1.5 rounded-md text-sm font-medium hover:bg-white/90 active:bg-white/80 transition-colors"
            aria-label="Toggle language"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            <span className="font-semibold">{language === 'en' ? 'TH' : 'EN'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
