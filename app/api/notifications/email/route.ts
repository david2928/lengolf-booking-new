import { NextRequest, NextResponse } from 'next/server';
import {
  sendBookingConfirmationEmail,
  type BookingConfirmationEmailPayload,
} from '@/lib/notifications/bookingEmail';

// The payload shape and the mapping onto `sendConfirmationEmail` now live in
// `@/lib/notifications/bookingEmail` so in-process callers can reach them
// without a self-HTTP round trip. Behaviour here is unchanged.

export async function POST(request: NextRequest) {
  try {
    const payload: BookingConfirmationEmailPayload = await request.json();

    await sendBookingConfirmationEmail(payload);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in email notification handler:', error);
    return NextResponse.json(
      { error: 'Failed to send email confirmation' },
      { status: 500 }
    );
  }
}
