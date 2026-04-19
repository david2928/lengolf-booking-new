import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createTranslator, createFormatter } from 'next-intl';
import { resolveEmailLocale } from '@/lib/emailService';
import { getEmailMessages, bangkokDateTime } from '@/lib/i18n/email-helpers';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Email configuration - use the same as in emailService.ts
const EMAIL_HOST = process.env.EMAIL_HOST || '27.254.86.99';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM || 'notification@len.golf';

interface BookingCancellationBody {
  email: string;
  userName: string;
  subjectName?: string;
  bookingId: string;
  bookingDate: string;
  /** Optional raw YYYY-MM-DD date for locale-aware formatting. */
  bookingDateISO?: string;
  startTime: string;
  endTime?: string;
  duration: number;
  numberOfPeople: number;
  bayName?: string;
  cancellationReason?: string;
  language?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Check email configuration
    if (!EMAIL_USER || !EMAIL_PASS) {
      console.error('Email configuration missing - EMAIL_USER or EMAIL_PASS not set');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // 2. Parse request body
    const body: BookingCancellationBody = await request.json();
    const {
      email,
      userName,
      bookingId,
      bookingDate,
      bookingDateISO,
      startTime,
      endTime,
      duration,
      numberOfPeople,
      cancellationReason,
      language,
    } = body;

    // 3. Validate required fields
    if (!email || !userName || !bookingId || !bookingDate || !startTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const locale = resolveEmailLocale(language);
    const t = createTranslator({
      locale,
      messages: getEmailMessages(locale),
      namespace: 'emails.bookingCancellation',
    });
    const format = createFormatter({ locale });

    // Locale-aware date/time display when a raw ISO date is provided; otherwise
    // fall back to the upstream pre-formatted strings.
    const dateDisplay = bookingDateISO
      ? format.dateTime(bangkokDateTime(bookingDateISO, startTime), {
          dateStyle: 'long',
          timeZone: 'Asia/Bangkok',
        })
      : bookingDate;
    const startTimeDisplay = bookingDateISO
      ? format.dateTime(bangkokDateTime(bookingDateISO, startTime), {
          timeStyle: 'short',
          timeZone: 'Asia/Bangkok',
        })
      : startTime;
    const endTimeDisplay = bookingDateISO && endTime
      ? format.dateTime(bangkokDateTime(bookingDateISO, endTime), {
          timeStyle: 'short',
          timeZone: 'Asia/Bangkok',
        })
      : endTime;

    // 4. Create email transporter with same config as emailService.ts
    const transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: false,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates if necessary
      },
    });

    // 5. Create email content
    // Align subject line format with booking confirmation email
    const emailSubject = t('subject', { date: dateDisplay, time: startTimeDisplay });

    // Construct VIP bookings URL for rebooking
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.len.golf';
    const vipBookingsUrl = `${baseUrl}/vip/bookings`;

    const mailOptions = {
      from: `"LENGOLF" <${EMAIL_FROM}>`,
      to: email,
      subject: emailSubject,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #ffffff;">
          <!-- Logo Section -->
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://booking.len.golf/images/logo_v1.png" alt="${t('logoAlt')}" style="max-width: 200px;">
          </div>

          <!-- Header -->
          <h2 style="color: #1a3308; text-align: center; margin-bottom: 20px;">${t('heading')}</h2>

          <!-- Greeting -->
          <p style="font-size: 16px; line-height: 1.5; color: #1a3308; margin-bottom: 20px;">
            <strong>${t('greeting', { name: escapeHtml(userName) })}</strong>
          </p>
          <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            ${t('intro')}
          </p>

          <!-- Booking Details Table - Same format as confirmation email -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px;">
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('dateLabel')}</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(dateDisplay)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('startTimeLabel')}</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(startTimeDisplay)}</td>
            </tr>
            ${endTimeDisplay ? `
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('endTimeLabel')}</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(endTimeDisplay)}</td>
            </tr>
            ` : ''}
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('durationLabel')}</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${t('durationValue', { hours: duration })}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('peopleLabel')}</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${numberOfPeople}</td>
            </tr>
            ${cancellationReason ? `
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('reasonLabel')}</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd; white-space: pre-wrap;">${escapeHtml(cancellationReason)}</td>
            </tr>
            ` : ''}
          </table>

          <!-- Closing Message -->
          <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            ${t('closing')}
          </p>

          <!-- Rebooking Message -->
          <p style="font-size: 14px; line-height: 1.5; color: #777; margin-bottom: 20px;">
            <em>${t('rebookDisclaimerBefore')}<a href="${escapeHtml(vipBookingsUrl)}" style="color: #8dc743; text-decoration: none;">${t('rebookDisclaimerLink')}</a>${t('rebookDisclaimerAfter')}</em>
          </p>

          <!-- Footer - Same as confirmation email -->
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
    };

    // 6. Send email
    try {
      const info = await transporter.sendMail(mailOptions);

      // 7. Return success response
      return NextResponse.json({
        success: true,
        email,
        messageId: info.messageId
      });
    } catch (error: unknown) {
      console.error('Error sending cancellation email:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return NextResponse.json(
        {
          error: 'Failed to send cancellation email',
          details: errorMessage
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Exception in email cancellation handler:', error);
    return NextResponse.json(
      { error: 'An error occurred while sending cancellation email' },
      { status: 500 }
    );
  }
}
