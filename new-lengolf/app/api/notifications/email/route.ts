import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
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