import { Language, bayRatesTranslations } from '@/lib/liff/translations';
import { LIFF_URLS } from '@/lib/liff/urls';

interface BookNowButtonProps {
  language: Language;
}

export default function BookNowButton({ language }: BookNowButtonProps) {
  const t = bayRatesTranslations[language];

  const handleTouchStart = (e: React.TouchEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
  };

  return (
    <a
      href={LIFF_URLS.booking}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="block w-full bg-primary text-primary-foreground px-6 py-3.5 rounded-xl font-bold text-base text-center hover:opacity-90 active:opacity-80 transition-opacity shadow-lg"
    >
      {t.bookNow}
    </a>
  );
}
