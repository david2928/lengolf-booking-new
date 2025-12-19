import { Language, bayRatesTranslations } from '@/lib/liff/translations';

interface BayRatesHeaderProps {
  language: Language;
  onLanguageToggle: () => void;
}

export default function BayRatesHeader({ language, onLanguageToggle }: BayRatesHeaderProps) {
  const t = bayRatesTranslations[language];

  return (
    <header className="bg-primary text-primary-foreground py-4 sticky top-0 z-50 shadow-md">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">
            {t.title}
          </h1>

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
