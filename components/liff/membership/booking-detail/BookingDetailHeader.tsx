import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import { ArrowLeft } from 'lucide-react';
import LanguageSelector from '@/components/liff/shared/LanguageSelector';

interface BookingDetailHeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onBack: () => void;
}

export default function BookingDetailHeader({ language, onLanguageChange, onBack }: BookingDetailHeaderProps) {
  const t = membershipTranslations[language];

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-1 -ml-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">{t.bookingDetails}</h1>
        </div>
        <LanguageSelector language={language} onLanguageChange={onLanguageChange} variant="light" />
      </div>
    </div>
  );
}
