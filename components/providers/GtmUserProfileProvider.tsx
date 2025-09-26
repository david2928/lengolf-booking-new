'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { pushProfileDataToGtm } from '@/utils/gtm';

export interface UserProfileData {
  profileId: string | null;
  customerId: string | null;
  customerCode: string | null;
}

/**
 * Provider that pushes user profile data to the Google Tag Manager data layer
 * This makes profileId and customer information available for all GTM tracking
 */
export function GtmUserProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [, setProfileData] = useState<UserProfileData>({
    profileId: null,
    customerId: null,
    customerCode: null,
  });

  // Fetch user profile data and push to GTM data layer
  useEffect(() => {
    // Only run if user is authenticated and we have their ID
    if (status === 'authenticated' && session?.user?.id) {
      const fetchProfileData = async () => {
        try {
          const supabase = createClient();
          const userId = session.user.id;

          // Get profile data with linked customer information
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, customer_id')
            .eq('id', userId)
            .single();

          if (profileError) {
            console.error('Error fetching profile data:', profileError);
            return;
          }

          let customerCode = null;
          let customerName = null;

          // If profile has a linked customer, fetch customer details
          if (profile?.customer_id) {
            const { data: customer, error: customerError } = await supabase
              .from('customers')
              .select('customer_code, customer_name')
              .eq('id', profile.customer_id)
              .single();

            if (!customerError && customer) {
              customerCode = customer.customer_code;
              customerName = customer.customer_name;
            }
          }
            
          const userData = {
            profileId: userId,
            customerId: profile?.customer_id || null,
            customerCode: customerCode,
            customerName: customerName,
            // Legacy fields for backward compatibility
            stableHashId: null, // Deprecated but kept for existing GTM triggers
            customerID: customerCode
          };

          // Update state
          setProfileData({
            profileId: userData.profileId,
            customerId: userData.customerId,
            customerCode: userData.customerCode
          });

          // Push to GTM data layer
          pushProfileDataToGtm(userData);
        } catch (error) {
          console.error('Error in GTM profile data provider:', error);
        }
      };

      fetchProfileData();
    }
  }, [session?.user?.id, status]);

  return <>{children}</>;
} 