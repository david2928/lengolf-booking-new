import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { RootShell } from "@/components/layouts/RootShell";
import { isValidLocale } from "@/i18n/routing";

export const metadata: Metadata = {
  title: "LENGOLF Authentication",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  // /auth/error sits outside [locale] (the URL is registered as the OAuth
  // callback target), but we can still honor the user's chosen language by
  // reading the NEXT_LOCALE cookie that next-intl sets elsewhere.
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const lang = cookieLocale && isValidLocale(cookieLocale) ? cookieLocale : 'en';
  return <RootShell lang={lang}>{children}</RootShell>;
}
