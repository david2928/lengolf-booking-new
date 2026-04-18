import nodemailer from 'nodemailer';
import { createTranslator } from 'next-intl';
import { isAILabBay } from '@/lib/bayConfig';
import type { Locale } from '@/i18n/routing';
import { isValidLocale } from '@/i18n/routing';
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
  date: string;
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
    messages: messagesByLocale[locale],
    namespace: 'emails.bookingConfirmation',
  });

  const emailSubject = t('subject', { date: booking.date, time: booking.startTime });

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
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(booking.date)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${t('timeLabel')}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${t('timeValue', {
                  startTime: booking.startTime,
                  endTime: booking.endTime,
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
  startDate: string;
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
}

// Course rental email retains its existing English-only template for now.
// Course rental flow does not currently thread the customer locale through the
// reservation API, so translating here would require a separate upstream change.
export async function sendCourseRentalConfirmationEmail(booking: CourseRentalEmailConfirmation) {
  const emailSubject = `LENGOLF Course Rental Confirmation - ${booking.rentalCode}`;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  };

  const dateDisplay = booking.durationDays > 1
    ? `${formatDate(booking.startDate)} &rarr; ${formatDate(booking.endDate)} (${booking.durationDays} days)`
    : formatDate(booking.startDate);

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

  const emailContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://booking.len.golf/images/logo_v1.png" alt="LENGOLF Logo" style="max-width: 200px;">
        </div>

        <h2 style="color: #1a3308; text-align: center; margin-bottom: 20px;">Course Rental Reservation Confirmed!</h2>

        <p style="font-size: 16px; line-height: 1.5; color: #1a3308; margin-bottom: 5px;">
            Dear <strong>${safeName}</strong>,
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            Thank you for your golf club rental reservation. Here are your details:
        </p>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 15px; text-align: center; margin-bottom: 20px;">
            <p style="font-size: 14px; color: #555; margin: 0 0 5px;">Your Rental Code</p>
            <p style="font-size: 24px; font-weight: bold; color: #15803d; margin: 0; letter-spacing: 2px; font-family: monospace;">${safeRentalCode}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px;">
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Club Set</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                    <strong>${safeClubSetName}</strong>
                    <br><span style="font-size: 13px; color: #666;">${booking.clubSetTier === 'premium-plus' ? 'Premium+' : 'Premium'} &middot; ${booking.clubSetGender === 'mens' ? "Men's" : "Women's"}</span>
                </td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Rental Period</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${dateDisplay}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">${booking.deliveryRequested ? 'Delivery' : 'Pickup'}</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                    ${booking.deliveryRequested
                      ? `Delivery & Return<br><span style="font-size: 13px; color: #666;">${safeAddress}</span>`
                      : 'Pickup at LENGOLF<br><span style="font-size: 13px; color: #666;">Mercury Ville @ BTS Chidlom, Floor 4</span>'
                    }
                    ${safeDeliveryTime ? `<br><span style="font-size: 13px; color: #666;">Preferred time: ${safeDeliveryTime}</span>` : ''}
                </td>
            </tr>
            ${safeNotes ? `
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Notes</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; white-space: pre-wrap;">${safeNotes}</td>
            </tr>
            ` : ''}
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px;">
            <tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #555;">Club Rental (${booking.durationDays}d)</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right;">฿${booking.rentalPrice.toLocaleString()}</td>
            </tr>
            ${booking.deliveryRequested ? `
            <tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #555;">Delivery & Return</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right;">฿${booking.deliveryFee.toLocaleString()}</td>
            </tr>
            ` : ''}
            ${addOnsHtml}
            <tr style="font-weight: bold; font-size: 16px;">
                <td style="padding: 12px 10px; border-top: 2px solid #15803d; color: #15803d;">Total</td>
                <td style="padding: 12px 10px; border-top: 2px solid #15803d; text-align: right; color: #15803d;">฿${booking.totalPrice.toLocaleString()}</td>
            </tr>
        </table>

        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <p style="font-weight: bold; color: #1e40af; margin: 0 0 5px;">What happens next?</p>
            <p style="color: #1e40af; margin: 0; font-size: 14px;">Our team will contact you within 2 hours via LINE to confirm availability and send a payment link. You can pay by credit/debit card or Shopee wallet.</p>
        </div>

        <div style="font-size: 14px; color: #777; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="margin: 5px 0; text-align: center;">
                <strong>Phone Number:</strong> <a href="tel:+66966682335" style="color: #8dc743; text-decoration: none;">+66 96 668 2335</a>
            </p>
            <p style="margin: 5px 0; text-align: center;">
                <strong>LINE:</strong> <a href="https://lin.ee/UwwOr84" style="color: #8dc743; text-decoration: none;">@lengolf</a>
            </p>
            <p style="margin: 5px 0; text-align: center;">
                <strong>Address:</strong> 4th Floor, Mercury Ville at BTS Chidlom
            </p>
            <div style="text-align: center; margin-top: 20px;">
                <a href="https://len.golf" style="text-decoration: none; color: white; background-color: #1a3308; padding: 8px 15px; border-radius: 5px; font-size: 14px;">
                    Visit Our Website
                </a>
            </div>
            <p style="font-size: 12px; margin-top: 15px; color: #777; text-align: center;">
                &copy; ${new Date().getFullYear()} LENGOLF. All rights reserved.
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
