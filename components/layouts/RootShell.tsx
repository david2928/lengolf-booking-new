import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import '../../app/globals.css';
import { Providers } from '../../app/providers';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

type RootShellProps = {
  /** `lang` attribute for the `<html>` element. */
  lang: string;
  /** Extra nodes rendered inside `<head>` (e.g. GTM script, JSON-LD, preconnect hints). */
  head?: ReactNode;
  /** Extra nodes rendered at the top of `<body>`, before `<Providers>` (e.g. GTM noscript iframe). */
  bodyStart?: ReactNode;
  /** Children are rendered inside `<Providers>`. The caller is responsible for wrapping them in any
   * provider that needs to sit between `<Providers>` and the route tree (e.g. `NextIntlClientProvider`). */
  children: ReactNode;
};

/**
 * Shared `<html>` / `<body>` shell used by every top-level route tree
 * (`app/[locale]`, `app/auth`, `app/liff`). Owns font loading, globals.css,
 * and the shared `<Providers>` tree.
 *
 * Per-layout concerns stay per-layout:
 *   - `export const viewport` (LIFF uses a different viewport than the rest)
 *   - `export const metadata`
 *   - Anything that needs to wrap `children` inside `<Providers>` is passed in as `children`.
 */
export function RootShell({ lang, head, bodyStart, children }: RootShellProps) {
  return (
    <html lang={lang} className={`${poppins.variable} font-sans`}>
      {/* eslint-disable-next-line @next/next/no-head-element -- App Router root layouts render `<head>` directly; `next/head` is pages-router only. */}
      <head>{head}</head>
      <body>
        {bodyStart}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
