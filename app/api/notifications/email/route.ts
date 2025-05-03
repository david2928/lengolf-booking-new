import { NextRequest, NextResponse } from 'next/server';
import { sendConfirmationEmail } from '@/lib/emailService';

interface EmailConfirmation {
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
  // Optional standardized data field from the formatter
  standardizedData?: {
    emailData: {
      userDisplayName: string;
      subject: string;
    },
    // Common fields
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
  }
}

export async function POST(request: NextRequest) {
  try {
    const { customerNotes, ...bookingData }: EmailConfirmation & { customerNotes?: string } = await request.json();

    // Check if we have standardized data from the formatter
    if (bookingData.standardizedData) {
      const std = bookingData.standardizedData;
      
      // Send email confirmation with standardized data
      await sendConfirmationEmail({
        userName: bookingData.userName || std.emailData.userDisplayName,
        subjectName: bookingData.subjectName || std.customerName,
        email: std.email,
        date: std.formattedDate,
        startTime: std.startTime,
        endTime: std.endTime,
        bayNumber: std.bayName,
        duration: std.duration,
        numberOfPeople: std.numberOfPeople,
        packageInfo: bookingData.packageInfo,
        customerNotes: customerNotes
      });
      
      return NextResponse.json({ success: true });
    }

    // Fallback to legacy format for backward compatibility
    await sendConfirmationEmail({
      userName: bookingData.userName,
      subjectName: bookingData.subjectName || bookingData.userName,
      email: bookingData.email,
      date: bookingData.date,
      startTime: bookingData.startTime,
      endTime: bookingData.endTime,
      bayNumber: bookingData.bayNumber,
      duration: bookingData.duration,
      numberOfPeople: bookingData.numberOfPeople,
      packageInfo: bookingData.packageInfo,
      customerNotes: customerNotes
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in email notification handler:', error);
    return NextResponse.json(
      { error: 'Failed to send email confirmation' },
      { status: 500 }
    );
  }
} 