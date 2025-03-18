import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

interface LineErrorDetail {
  message: string;
}

interface LineErrorResponse {
  message?: string;
  details?: LineErrorDetail[];
}

interface ReviewRequestBody {
  userId: string;
  bookingName: string;
  bookingDate?: string;
  reviewUrl: string;
  voucherImageUrl: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Check LINE API configuration
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      console.error('LINE_CHANNEL_ACCESS_TOKEN is missing');
      return NextResponse.json(
        { error: 'LINE API not configured' },
        { status: 500 }
      );
    }

    // 2. Parse request body
    const body: ReviewRequestBody = await request.json();
    const { userId, bookingName, bookingDate, reviewUrl, voucherImageUrl } = body;

    // 3. Validate required fields
    if (!userId || !bookingName || !reviewUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 4. Build LINE message
    // Validate image URL - must be HTTPS for LINE API
    let safeVoucherImageUrl = voucherImageUrl;
    if (safeVoucherImageUrl && !safeVoucherImageUrl.startsWith('https://')) {
      console.warn(`WARNING: LINE API requires HTTPS image URLs. Converting ${safeVoucherImageUrl} to HTTPS`);
      safeVoucherImageUrl = safeVoucherImageUrl.replace('http://', 'https://');
      
      // If image URL is still not HTTPS, use a fallback image
      if (!safeVoucherImageUrl.startsWith('https://')) {
        console.warn(`Using fallback image URL for LINE message as original URL wasn't HTTPS`);
        safeVoucherImageUrl = 'https://www.len.golf/wp-content/uploads/2025/03/google_review_voucher.png';
      }
    }
    
    console.log(`Using image URL for LINE message: ${safeVoucherImageUrl}`);
    
    // Ensure text lengths are within LINE limits
    const titleText = 'LENGOLF Special Offer';
    const messageText = '1 FREE HOUR + FREE DRINK on your next visit!';
    
    // Create the LINE message
    const message = {
      to: userId,
      messages: [
        {
          type: 'text',
          text: `Thank you for visiting LENGOLF, ${bookingName}! We hope you enjoyed your golf session. 🏌️‍♂️`
        },
        {
          type: 'text',
          text: 'Your feedback is important to us! Please consider leaving us a Google review and receive a special thank you offer: 1 FREE HOUR + 1 FREE SOFT DRINK on your next visit!'
        },
        {
          type: 'template',
          altText: 'Leave a Google Review for LENGOLF - Get 1 FREE HOUR + FREE DRINK',
          template: {
            type: 'buttons',
            thumbnailImageUrl: safeVoucherImageUrl,
            imageAspectRatio: 'rectangle',
            imageSize: 'cover',
            title: titleText,
            text: messageText,
            actions: [
              {
                type: 'uri',
                label: 'Write a Review',
                uri: reviewUrl
              }
            ]
          }
        },
        {
          type: 'text',
          text: 'To redeem your offer, please show both your Google review and this LINE message during your next visit. Thank you!'
        }
      ]
    };
    
    console.log('LINE message payload:', JSON.stringify(message, null, 2));

    // 5. Send LINE message
    try {
      const response = await fetch(LINE_MESSAGING_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        // Get the response text to see the detailed error
        const errorText = await response.text();
        let errorDetails = errorText;
        
        // Try to parse the error response as JSON if possible
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = JSON.stringify(errorJson, null, 2);
        } catch (e) {
          // Keep as text if not JSON
        }
        
        console.error(`LINE API error details: ${errorDetails}`);
        throw new Error(`LINE API error: ${response.status} ${response.statusText} - ${errorDetails}`);
      }

      const responseData = await response.json();

      // 6. Return success response
      return NextResponse.json({
        success: true,
        userId,
        messageId: responseData?.messageId
      });
    } catch (error: unknown) {
      console.error('Error sending LINE message:', error);
      
      // Get error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return NextResponse.json(
        { 
          error: 'Failed to send LINE message',
          details: errorMessage
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Exception in LINE review request:', error);
    return NextResponse.json(
      { error: 'An error occurred while sending LINE review request' },
      { status: 500 }
    );
  }
} 