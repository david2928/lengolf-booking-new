/**
 * Booking-confirmation email, callable directly.
 *
 * The mapping from the notification payload onto `sendConfirmationEmail` used to
 * live in `app/api/notifications/email/route.ts`, so the only way to send a
 * confirmation was to HTTP POST our own serverless function. The route still
 * exists and behaves identically; it now delegates here.
 */

import { sendConfirmationEmail, resolveEmailLocale } from '@/lib/emailService';
import { isValidEmail } from '@/lib/email-format';

export interface BookingConfirmationEmailPayload {
  userName: string;
  subjectName?: string;
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
  language?: string;
  /** Optional standardized data field from the formatter. */
  standardizedData?: {
    emailData: {
      userDisplayName: string;
      subject: string;
    };
    bookingId: string;
    customerName: string;
    email: string;
    phoneNumber: string;
    date: string;
    formattedDate: string;
    startTime: string;
    endTime: string;
    bayName: string;
    duration: number;
    numberOfPeople: number;
  };
}

/**
 * Thrown when the confirmation did not go out.
 *
 * `sendConfirmationEmail` reports failure by RETURNING FALSE — it catches its
 * own errors so a delivery problem can never take down a booking. This function
 * used to await it and discard the boolean, so it resolved either way; callers
 * wrap it in `Promise.allSettled` and read "fulfilled" as sent. That is how
 * booking BK260803FKLR came to log `Email notification | success` for a send
 * nodemailer had refused outright. Converting false into a throw is what makes
 * `booking_process_logs` mean anything.
 */
export class BookingEmailNotSentError extends Error {
  constructor(reason: string) {
    super(`Booking confirmation email not sent: ${reason}`);
    this.name = 'BookingEmailNotSentError';
  }
}

export async function sendBookingConfirmationEmail(
  payload: BookingConfirmationEmailPayload
): Promise<void> {
  const { customerNotes, ...bookingData } = payload;
  const emailLocale = resolveEmailLocale(bookingData.language);

  // Check if we have standardized data from the formatter
  if (bookingData.standardizedData) {
    const std = bookingData.standardizedData;

    // Fail before the SMTP round trip rather than during it. Handing nodemailer
    // an unusable recipient costs a connect + AUTH to learn what a regex knows.
    if (!isValidEmail(std.email)) {
      throw new BookingEmailNotSentError('no usable recipient address');
    }

    // Send email confirmation with standardized data.
    // std.date holds the raw YYYY-MM-DD; pass it as dateISO so the email
    // function can format the date/time in the recipient's locale.
    const sent = await sendConfirmationEmail({
      userName: bookingData.userName || std.emailData.userDisplayName,
      subjectName: bookingData.subjectName || std.customerName,
      email: std.email,
      date: std.formattedDate,
      dateISO: std.date,
      startTime: std.startTime,
      endTime: std.endTime,
      bayNumber: std.bayName,
      duration: std.duration,
      numberOfPeople: std.numberOfPeople,
      packageInfo: bookingData.packageInfo,
      customerNotes: customerNotes,
      language: emailLocale,
    });

    if (!sent) throw new BookingEmailNotSentError('SMTP delivery failed');
    return;
  }

  // Fallback to legacy format for backward compatibility. bookingData.date
  // may be a raw ISO or a pre-formatted string; treat it as dateISO only if
  // it matches YYYY-MM-DD.
  if (!isValidEmail(bookingData.email)) {
    throw new BookingEmailNotSentError('no usable recipient address');
  }
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(bookingData.date) ? bookingData.date : undefined;
  const sent = await sendConfirmationEmail({
    userName: bookingData.userName,
    subjectName: bookingData.subjectName || bookingData.userName,
    email: bookingData.email,
    date: bookingData.date,
    dateISO: isoDate,
    startTime: bookingData.startTime,
    endTime: bookingData.endTime,
    bayNumber: bookingData.bayNumber,
    duration: bookingData.duration,
    numberOfPeople: bookingData.numberOfPeople,
    packageInfo: bookingData.packageInfo,
    customerNotes: customerNotes,
    language: emailLocale,
  });

  if (!sent) throw new BookingEmailNotSentError('SMTP delivery failed');
}
