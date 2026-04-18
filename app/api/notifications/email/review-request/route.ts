import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createTranslator } from 'next-intl';
import { resolveEmailLocale } from '@/lib/emailService';
import type { Locale } from '@/i18n/routing';
import enMessages from '@/messages/en.json';
import thMessages from '@/messages/th.json';
import koMessages from '@/messages/ko.json';
import jaMessages from '@/messages/ja.json';
import zhMessages from '@/messages/zh.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const messagesByLocale: Record<Locale, any> = {
  en: enMessages,
  th: thMessages,
  ko: koMessages,
  ja: jaMessages,
  zh: zhMessages,
};

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

interface ReviewRequestBody {
  email: string;
  userName: string;
  bookingDate?: string;
  reviewUrl: string;
  voucherImageUrl: string;
  language?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Check email configuration
    if (!EMAIL_USER || !EMAIL_PASS) {
      console.error('Email configuration missing');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // 2. Parse request body
    const body: ReviewRequestBody = await request.json();
    const { email, userName, reviewUrl, voucherImageUrl, language } = body;

    // 3. Validate required fields
    if (!email || !userName || !reviewUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const locale = resolveEmailLocale(language);
    const t = createTranslator({
      locale,
      messages: messagesByLocale[locale],
      namespace: 'emails.reviewRequest',
    });

    // Ensure the voucher image URL is a valid, fully-qualified URL with HTTPS
    let safeVoucherImageUrl = voucherImageUrl;

    // Check if URL is already HTTPS
    if (!safeVoucherImageUrl.startsWith('https://')) {
      // If it starts with HTTP, convert to HTTPS
      if (safeVoucherImageUrl.startsWith('http://')) {
        console.log(`Converting HTTP image URL to HTTPS: ${safeVoucherImageUrl}`);
        safeVoucherImageUrl = safeVoucherImageUrl.replace('http://', 'https://');
      }
      // If it's a relative URL (starts with / or doesn't have protocol), use a fallback
      else if (safeVoucherImageUrl.startsWith('/') || !safeVoucherImageUrl.includes('://')) {
        console.log(`Using fallback for relative URL: ${safeVoucherImageUrl}`);
        safeVoucherImageUrl = 'https://booking.len.golf/images/google_review_voucher_email.png';
      }
    }

    console.log(`Using email voucher image URL: ${safeVoucherImageUrl}`);

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
    const mailOptions = {
      from: `"LENGOLF" <${EMAIL_FROM}>`,
      to: email,
      subject: t('subject'),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://booking.len.golf/images/logo_v1.png" alt="${t('logoAlt')}" style="max-width: 200px;">
          </div>

          <div style="margin-bottom: 30px;">
            <h2 style="color: #1a3308; text-align: center; margin-bottom: 15px;">${t('heading')}</h2>
            <p>${t('greeting', { name: escapeHtml(userName) })}</p>
            <p>${t('intro')} 🏌️‍♂️</p>
            <p>${t('feedbackPrompt')}</p>
          </div>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 30px;">
            <h3 style="color: #1a3308; margin-top: 0; text-align: center;">${t('offerHeading')}</h3>
            <p style="text-align: center; font-weight: bold; font-size: 18px; color: #1a3308;">${t('offerTitle')}</p>
            <p style="text-align: center;">${t('offerSubtitle')}</p>
            <div style="text-align: center; margin: 20px 0;">
              <img src="${escapeHtml(safeVoucherImageUrl)}" alt="${t('voucherAlt')}" style="max-width: 100%; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            </div>
            <p style="text-align: center;"><em>${t('redemptionNote')}</em></p>
          </div>

          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${escapeHtml(reviewUrl)}" style="display: inline-block; background-color: #1a3308; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
              ${t('reviewCta')}
            </a>
          </div>

          <!-- Footer -->
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
      console.error('Error sending email:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return NextResponse.json(
        {
          error: 'Failed to send email',
          details: errorMessage
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Exception in email review request:', error);
    return NextResponse.json(
      { error: 'An error occurred while sending email review request' },
      { status: 500 }
    );
  }
}
