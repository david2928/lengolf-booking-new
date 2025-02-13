import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { sendConfirmationEmail } from '@/lib/emailService';

interface EmailConfirmation {
  userName: string;
  email: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  numberOfPeople: number;
}

export async function POST(request: NextRequest) {
  try {
    // Verify user authentication
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const booking: EmailConfirmation = await request.json();
    const success = await sendConfirmationEmail(booking);

    if (!success) {
      throw new Error('Failed to send confirmation email');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
    return NextResponse.json(
      { error: 'Failed to send confirmation email' },
      { status: 500 }
    );
  }
} 