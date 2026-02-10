'use client';

import { Language } from '@/lib/liff/translations';
import { bookingTranslations } from '@/lib/liff/booking-translations';
import LanguageSelector from '@/components/liff/shared/LanguageSelector';

interface BookingHeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onBack?: () => void;
  showBack?: boolean;
}

export default function BookingHeader({
  language,
  onLanguageChange,
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

          <LanguageSelector language={language} onLanguageChange={onLanguageChange} />
        </div>
      </div>
    </header>
  );
}
