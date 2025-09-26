import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_REVIEW_URL = 'https://g.page/r/CXwvpW56UsBgEAE/review';
const VOUCHER_IMAGE_URL = process.env.REVIEW_VOUCHER_IMAGE_URL || 'https://www.len.golf/wp-content/uploads/2024/06/Logo.png';

interface SendReviewRequestBody {
  bookingId: string;
  userId: string;
  provider: 'line' | 'email';
  contactInfo: string;
}

/**
 * This endpoint handles sending a single review request.
 * It's designed to be called by Upstash QStash after the scheduled delay.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const authHeader = request.headers.get('Authorization');
    const apiKey = process.env.QSTASH_API_KEY || process.env.CRON_API_KEY;
    
    // Verify either QStash signature or API key
    const qStashSignature = request.headers.get('Upstash-Signature');
    const isFromQStash = !!qStashSignature; // In a real implementation, verify this signature
    
    if (!isFromQStash && (!apiKey || !authHeader || authHeader !== `Bearer ${apiKey}`)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body: SendReviewRequestBody = await request.json();
    const { bookingId, provider, contactInfo } = body;

    // For testing, we'll skip booking validation
    // and use hardcoded values instead
    const bookingName = "Test User";

    // 4. Send review request
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    if (provider === 'line') {
      // Send LINE notification
      await fetch(`${baseUrl}/api/notifications/line/review-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: contactInfo,
          bookingName: bookingName,
          reviewUrl: GOOGLE_REVIEW_URL,
          voucherImageUrl: VOUCHER_IMAGE_URL
        })
      });
    } else {
      // Send email notification
      await fetch(`${baseUrl}/api/notifications/email/review-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: contactInfo,
          userName: bookingName,
          reviewUrl: GOOGLE_REVIEW_URL,
          voucherImageUrl: VOUCHER_IMAGE_URL
        })
      });
    }

    // 5. Return success response
    return NextResponse.json({
      success: true,
      message: `Review request sent via ${provider} to ${contactInfo}`,
      booking: bookingId
    });
  } catch (error) {
    console.error('Exception in sending review request:', error);
    return NextResponse.json(
      { error: 'An error occurred while sending the review request' },
      { status: 500 }
    );
  }
} 