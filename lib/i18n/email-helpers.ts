import 'server-only';
import type { Locale } from '@/i18n/routing';
import enMessages from '@/messages/en.json';
import thMessages from '@/messages/th.json';
import koMessages from '@/messages/ko.json';
import jaMessages from '@/messages/ja.json';
import zhMessages from '@/messages/zh.json';

type Messages = typeof enMessages;

const MESSAGES_BY_LOCALE: Record<Locale, Messages> = {
  en: enMessages,
  th: thMessages as unknown as Messages,
  ko: koMessages as unknown as Messages,
  ja: jaMessages as unknown as Messages,
  zh: zhMessages as unknown as Messages,
};

/**
 * Returns the next-intl `messages` object for the given locale. Used by
 * server-side `createTranslator({ locale, messages, ... })` calls in the
 * email surface (`lib/emailService.ts` and `app/api/notifications/email/**`).
 */
export function getEmailMessages(locale: Locale): Messages {
  return MESSAGES_BY_LOCALE[locale];
}

/**
 * Build a UTC-anchored Date for a bay in Asia/Bangkok from a YYYY-MM-DD
 * date + HH:MM local time. Bangkok has no DST (always UTC+7), so subtracting
 * 7h from the naive UTC stamp is correct.
 *
 * Use this when you have raw date+time strings from the bookings table and
 * need a Date that `createFormatter({ locale }).dateTime(d, { timeZone: 'Asia/Bangkok' })`
 * will render correctly in the customer's locale.
 */
export function bangkokDateTime(dateISO: string, time: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - 7, mm || 0));
}
