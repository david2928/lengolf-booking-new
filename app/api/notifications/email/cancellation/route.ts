import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

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
  startTime: string;
  endTime?: string;
  duration: number;
  numberOfPeople: number;
  bayName?: string;
  cancellationReason?: string;
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
      startTime, 
      endTime,
      duration,
      numberOfPeople,
      cancellationReason
    } = body;

    // 3. Validate required fields
    if (!email || !userName || !bookingId || !bookingDate || !startTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

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

    // 5. Format display name

    // 6. Create email content  
    // Align subject line format with booking confirmation email
    const emailSubject = `LENGOLF Booking Cancellation - ${bookingDate} at ${startTime}`;
    
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
            <img src="https://www.len.golf/wp-content/uploads/2024/06/Logo.png" alt="LENGOLF Logo" style="max-width: 200px;">
          </div>
          
          <!-- Header -->
          <h2 style="color: #1a3308; text-align: center; margin-bottom: 20px;">Booking Cancelled</h2>
          
          <!-- Greeting -->
          <p style="font-size: 16px; line-height: 1.5; color: #1a3308; margin-bottom: 20px;">
            Dear <strong>${userName}</strong>,
          </p>
          <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            We confirm that your booking has been successfully cancelled. Here are the details of your cancelled reservation:
          </p>
          
          <!-- Booking Details Table - Same format as confirmation email -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px;">
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Date</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${bookingDate}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Start Time</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${startTime}</td>
            </tr>
            ${endTime ? `
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">End Time</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${endTime}</td>
            </tr>
            ` : ''}
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Duration</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${duration} hour(s)</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Number of People</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${numberOfPeople}</td>
            </tr>
            ${cancellationReason ? `
            <tr>
              <th style="text-align: left; padding: 10px; background-color: #f9f9f9; border-bottom: 1px solid #ddd;">Cancellation Reason</th>
              <td style="padding: 10px; border-bottom: 1px solid #ddd; white-space: pre-wrap;">${cancellationReason}</td>
            </tr>
            ` : ''}
          </table>
          
          <!-- Closing Message -->
          <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            If this cancellation was made in error, please contact us immediately. We look forward to welcoming you back to LENGOLF soon!
          </p>
          
          <!-- Rebooking Message -->
          <p style="font-size: 14px; line-height: 1.5; color: #777; margin-bottom: 20px;">
            <em>Ready to book again? Visit your <a href="${vipBookingsUrl}" style="color: #8dc743; text-decoration: none;">My Bookings</a> page or our main website to make a new reservation.</em>
          </p>
          
          <!-- Footer - Same as confirmation email -->
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
              &copy; 2024 LENGOLF. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    // 7. Send email
    try {
      const info = await transporter.sendMail(mailOptions);
      
      // 8. Return success response
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