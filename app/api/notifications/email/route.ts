import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { sendConfirmationEmail } from '@/lib/emailService';
import { createServerClient } from '@/utils/supabase/server';

interface EmailConfirmation {
  userName: string;
  email: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  numberOfPeople: number;
  bayNumber?: string;
  phoneNumber?: string;
  userId?: string;
  packageInfo?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    // Authenticate via NextAuth
    const token = await getToken({ 
      req: request as any,
      secret: process.env.NEXTAUTH_SECRET 
    });

    if (!token) {
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    const bookingData: EmailConfirmation & { skipCrmMatch?: boolean } = await request.json();
    
    // Get package info if userId is provided and CRM matching is not skipped
    if (bookingData.userId && !bookingData.skipCrmMatch && !bookingData.packageInfo) {
      const supabase = createServerClient();
      
      // Get CRM customer mapping
      const { data: mapping } = await supabase
        .from('crm_customer_mapping')
        .select('crm_customer_id')
        .eq('profile_id', bookingData.userId)
        .eq('is_matched', true)
        .maybeSingle();
      
      if (mapping?.crm_customer_id) {
        // Get packages for this customer
        const { data: packages } = await supabase
          .from('crm_packages')
          .select('*')
          .eq('crm_customer_id', mapping.crm_customer_id)
          .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
          .order('expiration_date', { ascending: true });
        
        if (packages && packages.length > 0) {
          // Filter out coaching packages
          const nonCoachingPackages = packages.filter(pkg => 
            !pkg.package_type_name.toLowerCase().includes('coaching')
          );
          
          if (nonCoachingPackages.length > 0) {
            const firstPackage = nonCoachingPackages[0];
            bookingData.packageInfo = `Package (${firstPackage.package_type_name})`;
          }
        }
      }
    }
    
    // If no package info was set, use default
    if (!bookingData.packageInfo) {
      bookingData.packageInfo = "Normal Booking";
    }

    // Important: Remove skipCrmMatch from the data to avoid passing it to the email service
    // which doesn't expect this field
    const { skipCrmMatch, ...emailData } = bookingData;
    
    const success = await sendConfirmationEmail(emailData);

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