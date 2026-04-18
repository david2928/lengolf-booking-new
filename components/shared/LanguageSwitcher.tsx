'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, localeNativeName, type Locale } from '@/i18n/routing';

type LanguageSwitcherProps = {
  /**
   * Visual variant. 'dark' is the default, for dark backgrounds (e.g. the main booking header).
   * 'light' is for light backgrounds (e.g. the login page).
   */
  variant?: 'dark' | 'light';
};

const VARIANT_CLASSES: Record<NonNullable<LanguageSwitcherProps['variant']>, string> = {
  dark: 'bg-transparent text-sm px-2 py-1 border border-white/30 text-white rounded focus:outline-none focus:ring-2 focus:ring-white/50 [&>option]:text-gray-900',
  light:
    'bg-white text-sm px-2 py-1 border border-gray-300 text-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-gray-300 [&>option]:text-gray-900',
};

export function LanguageSwitcher({ variant = 'dark' }: LanguageSwitcherProps = {}) {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [pending, startTransition] = useTransition();

  const handleChange = (next: Locale) => {
    startTransition(() => {
      // Cookie is set automatically by next-intl via router.replace.
      router.replace(pathname, { locale: next });
      // Best-effort server-side persistence for logged-in users.
      if (session) {
        fetch('/api/user/language', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        }).catch(() => {
          /* non-fatal */
        });
      }
    });
  };

  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => handleChange(e.target.value as Locale)}
      disabled={pending}
      className={VARIANT_CLASSES[variant]}
    >
      {routing.locales.map((loc) => (
        <option key={loc} value={loc}>
          {localeNativeName[loc]}
        </option>
      ))}
    </select>
  );
}
