import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { sendConfirmationEmail } from '@/lib/emailService';
import { createServerClient } from '@/utils/supabase/server';
import { getOrCreateCrmMapping } from '@/utils/customer-matching';

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
  packageInfo?: string;
  // Additional fields for our internal use
  userId?: string;
  skipCrmMatch?: boolean;
  stableHashId?: string;
  crmCustomerId?: string;
  crmCustomerData?: any;
}

export async function POST(request: NextRequest) {
  try {
    // We're not verifying tokens for internal API calls
    // This avoids 401 errors when called from other API routes
    const bookingData: EmailConfirmation = await request.json();

    // If we have a userId but no package info, try to find a package
    if (bookingData.userId && !bookingData.packageInfo && !bookingData.skipCrmMatch) {
      try {
        // Use provided stableHashId if available
        if (bookingData.stableHashId) {
          // Look up packages using the provided stable hash ID
          const supabase = createServerClient();
          const { data: packages, error: packagesError } = await supabase
            .from('crm_packages')
            .select('*')
            .eq('stable_hash_id', bookingData.stableHashId)
            .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
            .order('expiration_date', { ascending: true });
          
          if (packagesError) {
            console.error('Error looking up packages by stable hash ID:', packagesError);
          } else if (packages && packages.length > 0) {
            // Use the first package's type
            bookingData.packageInfo = `Package (${packages[0].package_type_name})`;
          }
        }
        // If no stableHashId was provided, try to find one through CRM mapping
        else {
          // Get CRM mapping from profile ID
          const crmMapping = await getOrCreateCrmMapping(bookingData.userId, {
            source: 'email'
          });
          
          if (crmMapping && crmMapping.stableHashId) {
            const supabase = createServerClient();
            const { data: packages, error } = await supabase
              .from('crm_packages')
              .select('*')
              .eq('stable_hash_id', crmMapping.stableHashId)
              .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
              .order('expiration_date', { ascending: true });
            
            if (error) {
              console.error('Error looking up packages with CRM mapping:', error);
            } else if (packages && packages.length > 0) {
              // Use the first package
              bookingData.packageInfo = `Package (${packages[0].package_type_name})`;
            }
          }
        }
      } catch (error) {
        console.error('Error looking up CRM data for email notification:', error);
        // Continue without package info
      }
    }

    // Send email confirmation
    try {
      await sendConfirmationEmail({
        userName: bookingData.userName,
        email: bookingData.email,
        date: bookingData.date,
        startTime: bookingData.startTime,
        endTime: bookingData.endTime,
        bayNumber: bookingData.bayNumber,
        duration: bookingData.duration,
        numberOfPeople: bookingData.numberOfPeople,
        packageInfo: bookingData.packageInfo
      });
      
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      return NextResponse.json(
        { error: 'Failed to send email confirmation' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in email notification handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 