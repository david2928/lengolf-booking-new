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
    // Verify user authentication
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const bookingData: EmailConfirmation = await request.json();
    
    // Get package info if userId is provided
    if (bookingData.userId) {
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

    const success = await sendConfirmationEmail(bookingData);

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