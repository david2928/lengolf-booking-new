'use client';

import { Globe } from 'lucide-react';
import { useI18nRouter } from '@/lib/i18n/navigation';
import { useCurrentLocale } from '@/lib/i18n/client';
import { Button } from '@/components/ui/button';
import { useState, Suspense } from 'react';

function LanguageSwitcherContent() {
  const { switchLocale } = useI18nRouter();
  const currentLocale = useCurrentLocale();
  const [isChanging, setIsChanging] = useState(false);

  const toggleLanguage = () => {
    setIsChanging(true);
    const newLocale = currentLocale === 'en' ? 'th' : 'en';
    switchLocale(newLocale);
    
    // Reset after a short delay to prevent flash
    setTimeout(() => setIsChanging(false), 300);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      disabled={isChanging}
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 hover:text-white disabled:opacity-75 transition-all duration-200"
      aria-label={`Switch to ${currentLocale === 'en' ? 'Thai' : 'English'}`}
    >
      <Globe className="h-4 w-4" />
      <span>
        {isChanging ? '...' : (currentLocale === 'en' ? 'ไทย' : 'EN')}
      </span>
    </Button>
  );
}

export function LanguageSwitcher() {
  return (
    <Suspense fallback={
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white/50"
      >
        <Globe className="h-4 w-4" />
        <span>EN</span>
      </Button>
    }>
      <LanguageSwitcherContent />
    </Suspense>
  );
}