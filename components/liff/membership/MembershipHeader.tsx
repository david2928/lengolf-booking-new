import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import LanguageSelector from '@/components/liff/shared/LanguageSelector';

interface MembershipHeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  userName?: string;
}

export default function MembershipHeader({ language, onLanguageChange, userName }: MembershipHeaderProps) {
  const t = membershipTranslations[language];

  return (
    <header className="bg-primary text-primary-foreground py-4 sticky top-0 z-50 shadow-md">
      <div className="px-4">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-white">
              {t.title}
            </h1>
            {userName && (
              <p className="text-sm text-white/90 mt-0.5">
                {t.welcome}, {userName}
              </p>
            )}
          </div>

          <LanguageSelector language={language} onLanguageChange={onLanguageChange} />
        </div>
      </div>
    </header>
  );
}
