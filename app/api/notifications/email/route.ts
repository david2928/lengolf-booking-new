import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { sendConfirmationEmail } from '@/lib/emailService';
import { createServerClient } from '@/utils/supabase/server';
import { crmLogger } from '@/utils/logging';
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
  // Generate a unique request ID for this notification
  const requestId = crmLogger.newRequest();
  
  try {
    // We're not verifying tokens for internal API calls
    // This avoids 401 errors when called from other API routes
    const bookingData: EmailConfirmation = await request.json();

    // Log the received booking data for debugging
    crmLogger.debug(
      'Raw booking data received in email notification',
      { 
        ...bookingData,
        hasUserId: !!bookingData.userId,
        hasPackageInfo: !!bookingData.packageInfo,
        hasBayNumber: !!bookingData.bayNumber
      },
      { 
        requestId, 
        profileId: bookingData.userId || 'unknown', 
        source: 'email' 
      }
    );

    // If we have a userId but no package info, try to find a package
    if (bookingData.userId && !bookingData.packageInfo && !bookingData.skipCrmMatch) {
      try {
        crmLogger.info(
          'Looking up CRM mapping for email notification',
          { userId: bookingData.userId },
          { requestId, profileId: bookingData.userId, source: 'email' }
        );
        
        // Use provided stableHashId if available
        if (bookingData.stableHashId) {
          crmLogger.info(
            'Using provided stable hash ID in email notification',
            { stableHashId: bookingData.stableHashId },
            { 
              requestId, 
              profileId: bookingData.userId,
              stableHashId: bookingData.stableHashId, 
              source: 'email' 
            }
          );
          
          // Look up packages using the provided stable hash ID
          const supabase = createServerClient();
          const { data: packages, error: packagesError } = await supabase
            .from('crm_packages')
            .select('*')
            .eq('stable_hash_id', bookingData.stableHashId)
            .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
            .order('expiration_date', { ascending: true });
          
          if (packagesError) {
            crmLogger.error(
              'Error looking up packages by stable hash ID',
              { error: packagesError, stableHashId: bookingData.stableHashId },
              { 
                requestId, 
                profileId: bookingData.userId, 
                stableHashId: bookingData.stableHashId,
                source: 'email' 
              }
            );
          } else if (packages && packages.length > 0) {
            // Find first non-coaching package
            const nonCoachingPackages = packages.filter(pkg => 
              !pkg.package_type_name.toLowerCase().includes('coaching')
            );
            
            if (nonCoachingPackages.length > 0) {
              const firstPackage = nonCoachingPackages[0];
              bookingData.packageInfo = `Package (${firstPackage.package_type_name})`;
              
              crmLogger.info(
                'Using package from stable hash ID in email notification',
                { 
                  packageType: firstPackage.package_type_name,
                  packageId: firstPackage.id,
                  expirationDate: firstPackage.expiration_date
                },
                { 
                  requestId, 
                  profileId: bookingData.userId, 
                  stableHashId: bookingData.stableHashId,
                  source: 'email' 
                }
              );
            }
          }
        } else {
          // Use our efficient CRM mapping function as fallback
          const crmMapping = await getOrCreateCrmMapping(bookingData.userId, {
            requestId,
            source: 'email',
            logger: crmLogger
          });
          
          if (crmMapping && crmMapping.stableHashId) {
            // Found a mapping, look up packages
            const supabase = createServerClient();
            const { data: packages, error: packagesError } = await supabase
              .from('crm_packages')
              .select('*')
              .eq('stable_hash_id', crmMapping.stableHashId)
              .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
              .order('expiration_date', { ascending: true });
              
            if (packages && packages.length > 0) {
              // Find first non-coaching package
              const nonCoachingPackages = packages.filter(pkg => 
                !pkg.package_type_name.toLowerCase().includes('coaching')
              );
              
              if (nonCoachingPackages.length > 0) {
                const firstPackage = nonCoachingPackages[0];
                bookingData.packageInfo = `Package (${firstPackage.package_type_name})`;
                
                crmLogger.info(
                  'Using package from CRM mapping in email notification',
                  { 
                    packageType: firstPackage.package_type_name,
                    packageId: firstPackage.id,
                    expirationDate: firstPackage.expiration_date
                  },
                  { 
                    requestId, 
                    profileId: bookingData.userId, 
                    stableHashId: crmMapping.stableHashId,
                    crmCustomerId: crmMapping.crmCustomerId,
                    source: 'email' 
                  }
                );
              }
            }
          }
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

    // Send the email
    await sendConfirmationEmail(emailData);

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