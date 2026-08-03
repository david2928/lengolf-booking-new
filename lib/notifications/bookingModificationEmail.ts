/**
 * "Booking updated" email, callable directly.
 *
 * Deliberately a library function rather than an `app/api/notifications/email/*`
 * route: the only caller is `/api/vip/bookings/[id]/modify`, which already holds
 * the payload in process, and self-HTTP would cost a second serverless
 * invocation plus a TLS handshake on the customer-visible path. Same reasoning
 * as `bookingEmail.ts` and `staffLine.ts`.
 *
 * The customer gets the NEW details as the body of the email — that is what they
 * need to act on — with a single "previously" line underneath so they can tell
 * at a glance that the right booking moved.
 */

import 'server-only';
import nodemailer from 'nodemailer';
import { createTranslator, createFormatter } from 'next-intl';
import { resolveEmailLocale } from '@/lib/emailService';
import { getEmailMessages, bangkokDateTime } from '@/lib/i18n/email-helpers';

const EMAIL_HOST = process.env.EMAIL_HOST || '27.254.86.99';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM || 'notification@len.golf';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface BookingModificationEmailPayload {
  email: string;
  userName: string;
  bookingId: string;
  /** New slot. `yyyy-MM-dd` + `HH:mm`, Bangkok wall clock. */
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  numberOfPeople: number;
  /** Previous slot, for the "previously" line. Omitted when the time did not move. */
  previousDate?: string;
  previousStartTime?: string;
  previousEndTime?: string;
  /** `bookings.language` → `customers.preferred_language` → undefined. */
  language?: string;
}

export async function sendBookingModificationEmail(
  payload: BookingModificationEmailPayload
): Promise<void> {
  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error('Email service not configured (EMAIL_USER / EMAIL_PASSWORD)');
  }

  const locale = resolveEmailLocale(payload.language);
  const t = createTranslator({
    locale,
    messages: getEmailMessages(locale),
    namespace: 'emails.bookingModification',
  });
  const format = createFormatter({ locale });

  const dateDisplay = format.dateTime(bangkokDateTime(payload.date, payload.startTime), {
    dateStyle: 'long',
    timeZone: 'Asia/Bangkok',
  });
  const startDisplay = format.dateTime(bangkokDateTime(payload.date, payload.startTime), {
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });
  const endDisplay = format.dateTime(bangkokDateTime(payload.date, payload.endTime), {
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });

  // Only rendered when the slot actually moved — a guest-count-only edit should
  // not tell the customer their time changed.
  const movedSlot = Boolean(payload.previousDate && payload.previousStartTime);
  const previousDisplay = movedSlot
    ? `${format.dateTime(
        bangkokDateTime(payload.previousDate!, payload.previousStartTime!),
        { dateStyle: 'long', timeZone: 'Asia/Bangkok' }
      )}, ${format.dateTime(
        bangkokDateTime(payload.previousDate!, payload.previousStartTime!),
        { timeStyle: 'short', timeZone: 'Asia/Bangkok' }
      )}${
        payload.previousEndTime
          ? ` - ${format.dateTime(
              bangkokDateTime(payload.previousDate!, payload.previousEndTime),
              { timeStyle: 'short', timeZone: 'Asia/Bangkok' }
            )}`
          : ''
      }`
    : '';

  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: false,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    tls: { rejectUnauthorized: false },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.len.golf';
  const vipBookingsUrl = `${baseUrl}/vip/bookings`;

  const row = (label: string, value: string) => `
    <tr>
      <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${label}</th>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${value}</td>
    </tr>`;

  await transporter.sendMail({
    from: `"LENGOLF" <${EMAIL_FROM}>`,
    to: payload.email,
    subject: t('subject', { date: dateDisplay, time: startDisplay }),
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://booking.len.golf/images/logo_v1.png" alt="${t('logoAlt')}" style="max-width: 200px;">
        </div>

        <h2 style="color: #1a3308; text-align: center; margin-bottom: 20px;">${t('heading')}</h2>

        <p style="font-size: 16px; line-height: 1.5; color: #1a3308; margin-bottom: 20px;">
          <strong>${t('greeting', { name: escapeHtml(payload.userName) })}</strong>
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
          ${t('intro')}
        </p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 15px;">
          ${row(t('dateLabel'), escapeHtml(dateDisplay))}
          ${row(t('startTimeLabel'), escapeHtml(startDisplay))}
          ${row(t('endTimeLabel'), escapeHtml(endDisplay))}
          ${row(t('durationLabel'), t('durationValue', { hours: payload.duration }))}
          ${row(t('peopleLabel'), String(payload.numberOfPeople))}
          ${row(t('bookingIdLabel'), escapeHtml(payload.bookingId))}
        </table>

        ${movedSlot ? `
        <p style="font-size: 14px; line-height: 1.5; color: #777; margin-bottom: 20px;">
          ${t('previouslyLabel')} <s>${escapeHtml(previousDisplay)}</s>
        </p>
        ` : ''}

        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
          ${t('closing')}
        </p>

        <p style="font-size: 14px; line-height: 1.5; color: #777; margin-bottom: 20px;">
          <em>${t('manageDisclaimerBefore')}<a href="${escapeHtml(vipBookingsUrl)}" style="color: #8dc743; text-decoration: none;">${t('manageDisclaimerLink')}</a>${t('manageDisclaimerAfter')}</em>
        </p>

        <div style="font-size: 14px; color: #777; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          <p style="margin: 5px 0; text-align: center;">
            <strong>${t('footerPhoneLabel')}</strong> <a href="tel:+66966682335" style="color: #8dc743; text-decoration: none;">+66 96 668 2335</a>
          </p>
          <p style="margin: 5px 0; text-align: center;">
            <strong>${t('footerLineLabel')}</strong> <a href="https://lin.ee/UwwOr84" style="color: #8dc743; text-decoration: none;">@lengolf</a>
          </p>
          <p style="margin: 5px 0; text-align: center;">
            <strong>${t('footerMapsLabel')}</strong> <a href="https://maps.app.goo.gl/U6rgZyjCwC46dABy6" style="color: #8dc743; text-decoration: none;">${t('footerMapsValue')}</a>
          </p>
          <p style="margin: 5px 0; text-align: center;">
            <strong>${t('footerAddressLabel')}</strong> ${t('footerAddressValue')}
          </p>
          <div style="text-align: center; margin-top: 20px;">
            <a href="https://len.golf" style="text-decoration: none; color: white; background-color: #1a3308; padding: 8px 15px; border-radius: 5px; font-size: 14px;">
              ${t('visitWebsiteCta')}
            </a>
          </div>
          <p style="font-size: 12px; margin-top: 15px; color: #777; text-align: center;">
            ${t('copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    `,
  });
}
