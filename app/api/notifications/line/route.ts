import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface BookingNotification {
  customerName: string;
  email: string;
  phoneNumber: string;
  bookingDate: string;
  bookingStartTime: string;
  bookingEndTime: string;
  bayNumber: string;
  duration: number;
  numberOfPeople: number;
}

export async function POST(request: Request) {
  try {
    // Verify user authentication
    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    
    if (sessionError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const booking: BookingNotification = await request.json();

    const message = `Booking Notification
Name: ${booking.customerName}
Email: ${booking.email}
Phone: ${booking.phoneNumber}
Date: ${booking.bookingDate}
Time: ${booking.bookingStartTime} - ${booking.bookingEndTime}
Bay: ${booking.bayNumber}
People: ${booking.numberOfPeople}

This booking has been auto-confirmed. No need to re-confirm with the customer. Please double check bay selection`.trim();

    const response = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_LINE_NOTIFY_TOKEN}`,
      },
      body: new URLSearchParams({
        message,
      }),
    });

    if (!response.ok) {
      throw new Error(`LINE Notify API error: ${response.status} ${response.statusText}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send LINE notification:', error);
    return NextResponse.json(
      { error: 'Failed to send LINE notification' },
      { status: 500 }
    );
  }
} 