import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { sendConfirmationEmail } from '@/lib/emailService';
import { createServerClient } from '@/utils/supabase/server';
import { crmLogger } from '@/utils/logging';

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
  skipCrmMatch?: boolean;
}

export async function POST(request: NextRequest) {
  // Generate a unique request ID for this notification
  const requestId = crmLogger.newRequest();
  
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

    const bookingData: EmailConfirmation = await request.json();
    
    // If we have a userId but no package info, try to find a package
    if (bookingData.userId && !bookingData.packageInfo && !bookingData.skipCrmMatch) {
      try {
        // Find the CRM mapping for this user
        const supabase = createServerClient();
        const { data: mappingData } = await supabase
          .from('crm_customer_mappings')
          .select('stable_hash_id, crm_customer_id')
          .eq('profile_id', bookingData.userId)
          .maybeSingle();
          
        let stableHashId = null;
        let crmCustomerId = null;
        
        if (mappingData) {
          stableHashId = mappingData.stable_hash_id;
          crmCustomerId = mappingData.crm_customer_id;
          
          crmLogger.info(
            'Found stable_hash_id from mapping in email notification',
            { stableHashId, profileId: bookingData.userId },
            { requestId, profileId: bookingData.userId, stableHashId, crmCustomerId, source: 'email' }
          );
          
          // Look for active packages
          const { data: packages } = await supabase
            .from('crm_packages')
            .select('*')
            .eq('stable_hash_id', stableHashId)
            .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
            .order('expiration_date', { ascending: true });
            
          crmLogger.debug(
            'Package query results in email notification',
            { 
              packageCount: packages?.length || 0,
              packages,
              stableHashId
            },
            { requestId, profileId: bookingData.userId, stableHashId, crmCustomerId, source: 'email' }
          );
          
          if (packages && packages.length > 0) {
            // Find first non-coaching package
            const nonCoachingPackages = packages.filter(pkg => 
              !pkg.package_type_name.toLowerCase().includes('coaching')
            );
            
            crmLogger.debug(
              'Filtered packages in email notification',
              {
                beforeFiltering: packages.length,
                afterFiltering: nonCoachingPackages.length
              },
              { requestId, profileId: bookingData.userId, stableHashId, crmCustomerId, source: 'email' }
            );
            
            if (nonCoachingPackages.length > 0) {
              const firstPackage = nonCoachingPackages[0];
              bookingData.packageInfo = `Package (${firstPackage.package_type_name})`;
              
              crmLogger.info(
                'Using package in email notification',
                { 
                  packageType: firstPackage.package_type_name,
                  packageId: firstPackage.id,
                  expirationDate: firstPackage.expiration_date
                },
                { requestId, profileId: bookingData.userId, stableHashId, crmCustomerId, source: 'email' }
              );
            } else {
              crmLogger.info(
                'No non-coaching packages found in email notification',
                { packageCount: packages.length },
                { requestId, profileId: bookingData.userId, stableHashId, crmCustomerId, source: 'email' }
              );
            }
          } else {
            crmLogger.info(
              'No active packages found in email notification',
              { stableHashId },
              { requestId, profileId: bookingData.userId, stableHashId, crmCustomerId, source: 'email' }
            );
          }
        } else {
          crmLogger.warn(
            'No CRM mapping found for user in email notification',
            { profileId: bookingData.userId },
            { requestId, profileId: bookingData.userId, source: 'email' }
          );
        }
      } catch (error) {
        crmLogger.error(
          'Error looking up packages in email notification',
          { error, profileId: bookingData.userId },
          { requestId, profileId: bookingData.userId, source: 'email' }
        );
      }
      
      if (!bookingData.packageInfo) {
        bookingData.packageInfo = "Normal Booking";
        
        crmLogger.info(
          'Defaulting to Normal Booking in email notification',
          { profileId: bookingData.userId },
          { requestId, profileId: bookingData.userId, source: 'email' }
        );
      }
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
    crmLogger.error(
      'Exception in email notification',
      { error },
      { requestId, source: 'email' }
    );
    return NextResponse.json(
      { error: 'Failed to send confirmation email' },
      { status: 500 }
    );
  }
} 