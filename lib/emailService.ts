import nodemailer from 'nodemailer';
import { isAILabBay } from '@/lib/bayConfig';

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
  // Create the email subject without the name
  const emailSubject = `LENGOLF Booking Confirmation - ${booking.date} at ${booking.startTime}`;
  
  // Construct VIP bookings URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.len.golf';
  const vipBookingsUrl = `${baseUrl}/vip/bookings`;
  
  // Extract club rental info from customer notes
  let clubRentalInfo = null;
  if (booking.customerNotes) {
    const clubRentalMatch = booking.customerNotes.match(/Golf Club Rental: ([^\n]+)/);
    if (clubRentalMatch) {
      const [, setName] = clubRentalMatch;
      clubRentalInfo = { setName: setName.trim() };
    }
  }

  const emailContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #ffffff;">
        <!-- Logo Section -->
        <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://booking.len.golf/images/logo_v1.png" alt="LENGOLF Logo" style="max-width: 200px;">
        </div>

        <!-- Header -->
        <h2 style="color: #1a3308; text-align: center; margin-bottom: 20px;">Booking Confirmed!</h2>

        <!-- Greeting -->
        <p style="font-size: 16px; line-height: 1.5; color: #1a3308; margin-bottom: 20px;">
            Dear <strong>${booking.userName}</strong>,
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            Thank you for your booking. Here are your booking details:
        </p>

        <!-- Booking Details Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px;">
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Date</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${booking.date}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Time</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${booking.startTime} - ${booking.endTime} (${booking.duration}h)</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Number of People</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${booking.numberOfPeople}</td>
            </tr>
            ${booking.bayNumber ? `
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Bay Type</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                    <strong style="color: ${isAILabBay(booking.bayNumber) ? '#8B5CF6' : '#10B981'};">
                        ${isAILabBay(booking.bayNumber) ? 'AI Bay' : 'Social Bay'}
                    </strong>
                </td>
            </tr>
            ` : ''}
            ${clubRentalInfo ? `
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Golf Club Rental</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                    <strong>${clubRentalInfo.setName}</strong>
                    ${clubRentalInfo.setName === 'Standard Set' 
                      ? '<br><span style="font-size: 14px; color: #10B981;">Complimentary - included with your booking</span>'
                      : '<br><span style="font-size: 14px; color: #666;">Rental charges will be added based on duration</span>'
                    }
                </td>
            </tr>
            ` : ''}
            ${(() => {
              if (!booking.customerNotes) return '';
              
              // Remove golf club rental info from notes since it's already shown in its own section
              const cleanedNotes = booking.customerNotes.replace(/Golf Club Rental: [^\n]+/g, '').trim();
              
              // Only show notes section if there are actual notes remaining after removing club rental info
              if (cleanedNotes) {
                return `
            <tr>
                <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Notes/Requests</th>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; white-space: pre-wrap;">${cleanedNotes}</td>
            </tr>
                `;
              }
              return '';
            })()}
        </table>

        <!-- Closing Message -->
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            We look forward to seeing you! If you have any questions, feel free to reach out to us.
        </p>

        <!-- Booking Modification Disclaimer -->
        <p style="font-size: 14px; line-height: 1.5; color: #777; margin-bottom: 20px;">
            <em>Need to modify or cancel your booking? Visit your <a href="${vipBookingsUrl}" style="color: #8dc743; text-decoration: none;">My Bookings</a> page to manage your reservations online.</em>
        </p>

        <!-- Footer -->
        <div style="font-size: 14px; color: #777; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="margin: 5px 0; text-align: center;">
                <strong>Phone Number:</strong> <a href="tel:+66966682335" style="color: #8dc743; text-decoration: none;">+66 96 668 2335</a>
            </p>
            <p style="margin: 5px 0; text-align: center;">
                <strong>LINE:</strong> <a href="https://lin.ee/UwwOr84" style="color: #8dc743; text-decoration: none;">@lengolf</a>
            </p>
            <p style="margin: 5px 0; text-align: center;">
                <strong>Maps Link:</strong> <a href="https://maps.app.goo.gl/U6rgZyjCwC46dABy6" style="color: #8dc743; text-decoration: none;">How to find us</a>
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
            <p style="color: #1e40af; margin: 0; font-size: 14px;">Our team will contact you within 2 hours via phone or LINE to confirm availability and arrange payment. No payment is required now.</p>
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