import nodemailer from 'nodemailer';
import { createTranslator, createFormatter } from 'next-intl';
import { isAILabBay } from '@/lib/bayConfig';
import type { Locale } from '@/i18n/routing';
import { isValidLocale } from '@/i18n/routing';
import { getEmailMessages, bangkokDateTime } from '@/lib/i18n/email-helpers';

/**
 * Narrow an arbitrary value (e.g. from DB or request body) to a Locale,
 * falling back to 'en' if not a valid locale.
 */
export function resolveEmailLocale(value: unknown): Locale {
  if (typeof value === 'string' && isValidLocale(value)) {
    return value;
  }
  return 'en';
}

interface EmailConfirmation {
  userName: string;
  subjectName?: string; // Name to use in email subject
  email: string;
  /** Display-formatted date string (legacy, used as fallback if dateISO absent). */
  date: string;
  /** Raw booking date in YYYY-MM-DD form for locale-aware formatting. */
  dateISO?: string;
  startTime: string;
  endTime: string;
  duration: number;
  numberOfPeople: number;
  bayNumber?: string;
  phoneNumber?: string;
  packageInfo?: string;
  customerNotes?: string;
  language?: Locale;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'mail.len.golf',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false, // Allow certificate mismatches
    // Use the actual certificate hostname to avoid mismatch
    servername: 'cs94.hostneverdie.com',
  },
});

export async function sendConfirmationEmail(booking: EmailConfirmation) {
  const locale: Locale = booking.language ?? 'en';
  const t = createTranslator({
    locale,
    messages: getEmailMessages(locale),
    namespace: 'emails.bookingConfirmation',
  });
  const format = createFormatter({ locale });

  // If a raw ISO date is provided, render date/time in the recipient's locale
  // anchored to the venue's timezone (Asia/Bangkok). Otherwise fall back to the
  // upstream pre-formatted strings for backward compatibility.
  const dateDisplay = booking.dateISO
    ? format.dateTime(bangkokDateTime(booking.dateISO, booking.startTime), {
        dateStyle: 'long',
        timeZone: 'Asia/Bangkok',
      })
    : booking.date;
  const startTimeDisplay = booking.dateISO
    ? format.dateTime(bangkokDateTime(booking.dateISO, booking.startTime), {
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      })
    : booking.startTime;
  const endTimeDisplay = booking.dateISO
    ? format.dateTime(bangkokDateTime(booking.dateISO, booking.endTime), {
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      })
    : booking.endTime;

  const emailSubject = t('subject', { date: dateDisplay, time: startTimeDisplay });

  // Construct VIP bookings URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.len.golf';
  const vipBookingsUrl = `${baseUrl}/vip/bookings`;

  // Extract club rental info from customer notes
  let clubRentalInfo: { setName: string } | null = null;
  if (booking.customerNotes) {
    const clubRentalMatch = booking.customerNotes.match(/Golf Club Rental: ([^\n]+)/);
    if (clubRentalMatch) {
      const [, setName] = clubRentalMatch;
      clubRentalInfo = { setName: setName.trim() };
    }
  }

  const bayRowHtml = booking.bayNumber
    ? `
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('bayLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                    <strong style="color: ${isAILabBay(booking.bayNumber) ? '#8B5CF6' : '#10B981'};">
                        ${isAILabBay(booking.bayNumber) ? t('bayAi') : t('baySocial')}
                    </strong>
                </td>
            </tr>
            `
    : '';

  const clubRentalRowHtml = clubRentalInfo
    ? `
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('clubRentalLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                    <strong>${escapeHtml(clubRentalInfo.setName)}</strong>
                    ${
                      clubRentalInfo.setName === 'Standard Set'
                        ? `<br><span style="font-size: 14px; color: #10B981;">${t('clubRentalComplimentary')}</span>`
                        : `<br><span style="font-size: 14px; color: #666;">${t('clubRentalCharged')}</span>`
                    }
                </td>
            </tr>
            `
    : '';

  let notesRowHtml = '';
  if (booking.customerNotes) {
    const cleanedNotes = booking.customerNotes.replace(/Golf Club Rental: [^\n]+/g, '').trim();
    if (cleanedNotes) {
      notesRowHtml = `
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('notesLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; white-space: pre-wrap;">${escapeHtml(cleanedNotes)}</td>
            </tr>
                `;
    }
  }

  const emailContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #ffffff;">
        <!-- Logo Section -->
        <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://booking.len.golf/images/logo_v1.png" alt="${t('logoAlt')}" style="max-width: 200px;">
        </div>

        <!-- Header -->
        <h2 style="color: #1a3308; text-align: center; margin-bottom: 20px;">${t('heading')}</h2>

        <!-- Greeting -->
        <p style="font-size: 16px; line-height: 1.5; color: #1a3308; margin-bottom: 20px;">
            <strong>${t('greeting', { name: escapeHtml(booking.userName) })}</strong>
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            ${t('intro')}
        </p>

        <!-- Booking Details Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px;">
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('dateLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(dateDisplay)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('timeLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${t('timeValue', {
                  startTime: startTimeDisplay,
                  endTime: endTimeDisplay,
                  hours: booking.duration,
                })}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('peopleLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${booking.numberOfPeople}</td>
            </tr>
            ${bayRowHtml}
            ${clubRentalRowHtml}
            ${notesRowHtml}
        </table>

        <!-- Closing Message -->
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            ${t('closing')}
        </p>

        <!-- Booking Modification Disclaimer -->
        <p style="font-size: 14px; line-height: 1.5; color: #777; margin-bottom: 20px;">
            <em>${t('manageDisclaimerBefore')}<a href="${escapeHtml(vipBookingsUrl)}" style="color: #8dc743; text-decoration: none;">${t('manageDisclaimerLink')}</a>${t('manageDisclaimerAfter')}</em>
        </p>

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
  `.trim();

  const mailOptions = {
    from: 'LENGOLF <notification@len.golf>',
    to: booking.email,
    subject: emailSubject,
    html: emailContent,
  };

  try {
    console.log('Attempting to send email with config:', {
      host: process.env.EMAIL_HOST || 'mail.len.golf',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false'
    });

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', booking.email);
    return true;
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
    console.error('Email configuration:', {
      host: process.env.EMAIL_HOST || 'mail.len.golf',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      user: process.env.EMAIL_USER ? 'configured' : 'missing',
      pass: process.env.EMAIL_PASSWORD ? 'configured' : 'missing',
      rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false'
    });
    return false;
  }
}

interface CourseRentalEmailConfirmation {
  customerName: string;
  email: string;
  rentalCode: string;
  clubSetName: string;
  clubSetTier: string;
  clubSetGender: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  durationDays: number;
  deliveryRequested: boolean;
  deliveryAddress?: string;
  deliveryTime?: string;
  addOns: { label: string; price: number }[];
  rentalPrice: number;
  deliveryFee: number;
  totalPrice: number;
  notes?: string;
  language?: Locale;
  /**
   * Payment lifecycle marker for the course rental.
   * - 'paid': renders a "Payment received" line with transactionSn.
   * - 'awaiting_payment': renders a "Complete payment via the link
   *   we'll send" line. Used when the customer chose online pay
   *   but hasn't completed the ShopeePay flow yet.
   * - 'pay_at_pickup' (default): existing behavior — instructions
   *   to settle on arrival.
   */
  paymentStatus?: 'paid' | 'awaiting_payment' | 'pay_at_pickup';
  /** ShopeePay transaction reference, only meaningful when paymentStatus='paid'. */
  transactionSn?: string;
}

export async function sendCourseRentalConfirmationEmail(booking: CourseRentalEmailConfirmation) {
  const locale: Locale = booking.language ?? 'en';
  const t = createTranslator({
    locale,
    messages: getEmailMessages(locale),
    namespace: 'emails.courseRentalConfirmation',
  });
  const format = createFormatter({ locale });

  // Anchor dates to Asia/Bangkok (venue timezone) and format by locale.
  const formatDate = (dateStr: string) =>
    format.dateTime(bangkokDateTime(dateStr, '00:00'), {
      dateStyle: 'full',
      timeZone: 'Asia/Bangkok',
    });

  const dateDisplay =
    booking.durationDays > 1
      ? t('rentalPeriodRange', {
          startDate: formatDate(booking.startDate),
          endDate: formatDate(booking.endDate),
          days: booking.durationDays,
        })
      : t('rentalPeriodSingle', { date: formatDate(booking.startDate) });

  const safeName = escapeHtml(booking.customerName);
  const safeAddress = booking.deliveryAddress ? escapeHtml(booking.deliveryAddress) : '';
  const safeNotes = booking.notes ? escapeHtml(booking.notes) : '';
  const safeClubSetName = escapeHtml(booking.clubSetName);
  const safeRentalCode = escapeHtml(booking.rentalCode);
  const safeDeliveryTime = booking.deliveryTime ? escapeHtml(booking.deliveryTime) : '';

  const addOnsHtml = booking.addOns.length > 0
    ? booking.addOns.map(a => `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #555;">${escapeHtml(a.label)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right;">฿${a.price.toLocaleString()}</td>
      </tr>
    `).join('')
    : '';

  const tierLabel = booking.clubSetTier === 'premium-plus'
    ? t('clubSetTierPremiumPlus')
    : t('clubSetTierPremium');
  const genderLabel = booking.clubSetGender === 'mens'
    ? t('clubSetGenderMens')
    : t('clubSetGenderWomens');

  const emailSubject = t('subject', { rentalCode: booking.rentalCode });

  const emailContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://booking.len.golf/images/logo_v1.png" alt="${t('logoAlt')}" style="max-width: 200px;">
        </div>

        <h2 style="color: #1a3308; text-align: center; margin-bottom: 20px;">${t('heading')}</h2>

        <p style="font-size: 16px; line-height: 1.5; color: #1a3308; margin-bottom: 5px;">
            <strong>${t('greeting', { name: safeName })}</strong>
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            ${t('intro')}
        </p>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 15px; text-align: center; margin-bottom: 20px;">
            <p style="font-size: 14px; color: #555; margin: 0 0 5px;">${t('rentalCodeLabel')}</p>
            <p style="font-size: 24px; font-weight: bold; color: #15803d; margin: 0; letter-spacing: 2px; font-family: monospace;">${safeRentalCode}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px;">
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('clubSetLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                    <strong>${safeClubSetName}</strong>
                    <br><span style="font-size: 13px; color: #666;">${t('clubSetMeta', { tier: tierLabel, gender: genderLabel })}</span>
                </td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('rentalPeriodLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${dateDisplay}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${booking.deliveryRequested ? t('deliveryLabelDelivery') : t('deliveryLabelPickup')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                    ${booking.deliveryRequested
                      ? `${t('deliveryValueDelivery')}<br><span style="font-size: 13px; color: #666;">${safeAddress}</span>`
                      : `${t('deliveryValuePickup')}<br><span style="font-size: 13px; color: #666;">${t('deliveryPickupAddress')}</span>`
                    }
                    ${safeDeliveryTime ? `<br><span style="font-size: 13px; color: #666;">${t('deliveryPreferredTime', { time: safeDeliveryTime })}</span>` : ''}
                </td>
            </tr>
            ${safeNotes ? `
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('notesLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; white-space: pre-wrap;">${safeNotes}</td>
            </tr>
            ` : ''}
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px;">
            <tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #555;">${t('rentalFeeLabel', { days: booking.durationDays })}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right;">฿${booking.rentalPrice.toLocaleString()}</td>
            </tr>
            ${booking.deliveryRequested ? `
            <tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #555;">${t('deliveryFeeLabel')}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right;">฿${booking.deliveryFee.toLocaleString()}</td>
            </tr>
            ` : ''}
            ${addOnsHtml}
            <tr style="font-weight: bold; font-size: 16px;">
                <td style="padding: 12px 10px; border-top: 2px solid #15803d; color: #15803d;">${t('totalLabel')}</td>
                <td style="padding: 12px 10px; border-top: 2px solid #15803d; text-align: right; color: #15803d;">฿${booking.totalPrice.toLocaleString()}</td>
            </tr>
        </table>

        ${booking.paymentStatus === 'paid'
          ? `
        <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <p style="font-weight: bold; color: #15803d; margin: 0 0 5px;">${t('paymentReceivedHeading')}</p>
            <p style="color: #166534; margin: 0; font-size: 14px;">${t('paymentReceivedBody', { amount: booking.totalPrice.toLocaleString() })}</p>
            ${booking.transactionSn
              ? `<p style="color: #166534; margin: 8px 0 0; font-size: 12px;"><strong>${t('paymentReceivedTransactionLabel')}:</strong> <span style="font-family: monospace;">${escapeHtml(booking.transactionSn)}</span></p>`
              : ''}
        </div>
        `
          : booking.paymentStatus === 'awaiting_payment'
          ? `
        <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <p style="font-weight: bold; color: #b45309; margin: 0 0 5px;">${t('paymentAwaitingHeading')}</p>
            <p style="color: #92400e; margin: 0; font-size: 14px;">${t('paymentAwaitingBody')}</p>
        </div>
        `
          : ''}

        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <p style="font-weight: bold; color: #1e40af; margin: 0 0 5px;">${t('whatsNextHeading')}</p>
            <p style="color: #1e40af; margin: 0; font-size: 14px;">${t('whatsNextBody')}</p>
        </div>

        <div style="font-size: 14px; color: #777; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="margin: 5px 0; text-align: center;">
                <strong>${t('footerPhoneLabel')}</strong> <a href="tel:+66966682335" style="color: #8dc743; text-decoration: none;">+66 96 668 2335</a>
            </p>
            <p style="margin: 5px 0; text-align: center;">
                <strong>${t('footerLineLabel')}</strong> <a href="https://lin.ee/UwwOr84" style="color: #8dc743; text-decoration: none;">@lengolf</a>
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
  `.trim();

  const mailOptions = {
    from: 'LENGOLF <notification@len.golf>',
    to: booking.email,
    subject: emailSubject,
    html: emailContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Course rental confirmation email sent to:', booking.email);
    return true;
  } catch (error) {
    console.error('Failed to send course rental confirmation email:', error);
    return false;
  }
}
