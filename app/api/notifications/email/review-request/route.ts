import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

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
    const { email, userName, reviewUrl, voucherImageUrl } = body;

    // 3. Validate required fields
    if (!email || !userName || !reviewUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

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
        safeVoucherImageUrl = 'https://www.len.golf/wp-content/uploads/2025/03/google_review_voucher_email.png';
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
      subject: 'Enjoy a FREE HOUR on Your Next Visit to LENGOLF!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://www.len.golf/wp-content/uploads/2024/06/Logo.png" alt="LENGOLF Logo" style="max-width: 200px;">
          </div>
          
          <div style="margin-bottom: 30px;">
            <h2 style="color: #1a3308; text-align: center; margin-bottom: 15px;">Thank You for Visiting LENGOLF!</h2>
            <p>Hello ${userName},</p>
            <p>We hope you enjoyed your golf session. 🏌️‍♂️</p>
            <p>Your feedback is important to us! Please consider taking a moment to share your experience by leaving a Google review.</p>
          </div>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 30px;">
            <h3 style="color: #1a3308; margin-top: 0; text-align: center;">Special Offer Just for You!</h3>
            <p style="text-align: center; font-weight: bold; font-size: 18px; color: #1a3308;">1 FREE HOUR + 1 FREE SOFT DRINK</p>
            <p style="text-align: center;">As a token of our appreciation for your feedback!</p>
            <div style="text-align: center; margin: 20px 0;">
              <img src="${safeVoucherImageUrl}" alt="LENGOLF Special Offer" style="max-width: 100%; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            </div>
            <p style="text-align: center;"><em><strong>To redeem your offer:</strong> Please show both your Google review and this email during your next visit.</em></p>
          </div>
          
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${reviewUrl}" style="display: inline-block; background-color: #1a3308; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
              Leave a Google Review
            </a>
          </div>
          
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
                  &copy; 2024 LENGOLF. All rights reserved.
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