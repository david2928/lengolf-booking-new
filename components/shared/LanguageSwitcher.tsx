'use client';

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, localeNativeName, type Locale } from '@/i18n/routing';

/** Short code shown on the trigger — uniform width regardless of locale. */
const TRIGGER_CODE: Record<Locale, string> = {
  en: 'EN',
  th: 'TH',
  ja: 'JA',
  ko: 'KO',
  zh: 'ZH',
};

type LanguageSwitcherProps = {
  /**
   * Visual variant.
   * - `dark` (default): white-on-dark, for use over the green booking header.
   * - `light`: light neutral chrome, for use on white/light backgrounds (auth pages).
   *
   * Mirrors the `hero` / `header` variants in the lengolf-website `LocaleMenu`.
   */
  variant?: 'dark' | 'light';
};

export function LanguageSwitcher({ variant = 'dark' }: LanguageSwitcherProps = {}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Close on outside click + Escape (Esc returns focus to the trigger).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Focus the active item when the menu opens (a11y).
  useEffect(() => {
    if (!open) return;
    const activeIdx = Math.max(0, routing.locales.indexOf(locale));
    requestAnimationFrame(() => itemRefs.current[activeIdx]?.focus());
  }, [open, locale]);

  function handleSelect(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    startTransition(() => {
      // next-intl writes the NEXT_LOCALE cookie + swaps the URL prefix.
      router.replace(pathname, { locale: next });
      // Best-effort server-side persistence for logged-in users so the
      // preference survives on a different device / browser.
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
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (e.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    items[next]?.focus();
  }

  const isDark = variant === 'dark';
  const triggerClass = isDark
    ? 'border border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10'
    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50';

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('languageSwitcherLabel')}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${triggerClass}`}
      >
        <Globe size={14} aria-hidden />
        <span>{TRIGGER_CODE[locale]}</span>
        <ChevronDown
          size={12}
          aria-hidden
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('languageSwitcherLabel')}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-[60] mt-2 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-lg"
        >
          {routing.locales.map((loc, i) => {
            const active = loc === locale;
            return (
              <button
                key={loc}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => handleSelect(loc)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'bg-primary/5 font-semibold text-primary'
                    : 'hover:bg-gray-50'
                }`}
              >
                <span>{localeNativeName[loc]}</span>
                {active && <Check size={14} aria-hidden className="text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
