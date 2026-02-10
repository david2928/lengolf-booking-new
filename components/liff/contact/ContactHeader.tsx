import { Language, translations } from '@/lib/liff/translations';
import LanguageSelector from '@/components/liff/shared/LanguageSelector';

interface ContactHeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export default function ContactHeader({ language, onLanguageChange }: ContactHeaderProps) {
  const t = translations[language];

  return (
    <header className="bg-primary text-primary-foreground py-4 sticky top-0 z-50 shadow-md">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">
            {t.title}
          </h1>

          <LanguageSelector language={language} onLanguageChange={onLanguageChange} />
        </div>
      </div>
    </header>
  );
}
