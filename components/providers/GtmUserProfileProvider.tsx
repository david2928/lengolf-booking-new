'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { pushProfileDataToGtm } from '@/utils/gtm';

export interface UserProfileData {
  profileId: string | null;
  stableHashId: string | null;
}

/**
 * Provider that pushes user profile data to the Google Tag Manager data layer
 * This makes profileId and stableHashId available for all GTM tracking
 */
export function GtmUserProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [profileData, setProfileData] = useState<UserProfileData>({
    profileId: null,
    stableHashId: null,
  });

  // Fetch user profile data and push to GTM data layer
  useEffect(() => {
    // Only run if user is authenticated and we have their ID
    if (status === 'authenticated' && session?.user?.id) {
      const fetchProfileData = async () => {
        try {
          const supabase = createClient();
          const userId = session.user.id;

          // Get profile data directly
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();

          if (profileError) {
            console.error('Error fetching profile data:', profileError);
            return;
          }

          // Get CRM mapping to find stable hash ID
          const { data: crmMapping, error: crmError } = await supabase
            .from('crm_customer_mapping')
            .select('stable_hash_id, crm_customer_id')
            .eq('profile_id', userId)
            .eq('is_matched', true)
            .maybeSingle();

          if (crmError) {
            console.error('Error fetching CRM mapping:', crmError);
          }

          // Set profile data for GTM
          const userData = {
            profileId: userId,
            stableHashId: crmMapping?.stable_hash_id || null,
            customerID: crmMapping?.crm_customer_id || null // For backward compatibility
          };

          // Update state
          setProfileData({
            profileId: userData.profileId,
            stableHashId: userData.stableHashId
          });

          // Push to GTM data layer
          pushProfileDataToGtm(userData);
          
          console.log('Profile data pushed to GTM data layer:', {
            profileId: userData.profileId,
            stableHashId: userData.stableHashId
          });
        } catch (error) {
          console.error('Error in GTM profile data provider:', error);
        }
      };

      fetchProfileData();
    }
  }, [session?.user?.id, status]);

  return <>{children}</>;
} 