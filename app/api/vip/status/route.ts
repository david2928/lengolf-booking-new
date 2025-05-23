import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

interface VipStatusSessionUser extends NextAuthUser {
  id: string;
}

interface VipStatusSession extends NextAuthSession {
  accessToken?: string;
  user: VipStatusSessionUser;
}

// Helper to create admin client
const getSupabaseAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions) as VipStatusSession | null;

    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
    }

    const profileId = session.user.id;
    const userAccessToken = session.accessToken; 

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[VIP Status API] Supabase URL or Anon Key is not set.');
      return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${userAccessToken}`
        }
      }
    });
    const supabaseAdminClient = getSupabaseAdminClient(); // For 'customers' table access

    // --- BEGIN: Prioritize vip_customer_data for status ---
    const { data: profileVip, error: profileVipError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('vip_customer_data_id')
      .eq('id', profileId)
      .single();

    if (profileVipError && profileVipError.code !== 'PGRST116') { // PGRST116 means no rows found, not an actual error here
      console.error('[VIP Status API] Error fetching profiles_vip_staging:', JSON.stringify(profileVipError, null, 2));
      // Fall through to crm_customer_mapping if profile fetch fails for other reasons
    }

    if (profileVip?.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('stable_hash_id')
        .eq('id', profileVip.vip_customer_data_id)
        .single();

      if (vipDataError) {
        console.warn(`[VIP Status API] Error fetching vip_customer_data for id ${profileVip.vip_customer_data_id}:`, JSON.stringify(vipDataError, null, 2));
        // Fall through if error, as it might be an RLS issue or the record doesn't exist despite link
      } else if (vipData?.stable_hash_id) {
        // Query crm_customer_mapping_vip_staging to confirm the match
        const { data: crmMappingForVipHash, error: crmMappingError } = await supabaseUserClient
          .from('crm_customer_mapping_vip_staging')
          .select('crm_customer_id, stable_hash_id, is_matched') 
          .eq('stable_hash_id', vipData.stable_hash_id)
          .eq('is_matched', true) // Only consider confirmed matches
          .maybeSingle();

        if (crmMappingError) {
          console.error(`[VIP Status API] Error checking crm_customer_mapping_vip_staging for stable_hash_id ${vipData.stable_hash_id}:`, JSON.stringify(crmMappingError, null, 2));
          return NextResponse.json({
            status: 'linked_unmatched', 
            crmCustomerId: null,
            stableHashId: vipData.stable_hash_id,
          });
        }

        if (crmMappingForVipHash && crmMappingForVipHash.is_matched) {
          return NextResponse.json({
            status: 'linked_matched',
            crmCustomerId: crmMappingForVipHash.crm_customer_id,
            stableHashId: crmMappingForVipHash.stable_hash_id,
          });
        } else {
          return NextResponse.json({
            status: 'linked_unmatched', 
            crmCustomerId: null,
            stableHashId: vipData.stable_hash_id,
          });
        }
      } else {
        // This is a placeholder VIP account - attempt automatic CRM matching if phone number is available
        
        // Fetch the vip_customer_data to get the phone number
        const { data: vipCustomerData, error: vipCustomerDataError } = await supabaseUserClient
          .from('vip_customer_data')
          .select('vip_phone_number, vip_display_name, vip_email')
          .eq('id', profileVip.vip_customer_data_id)
          .single();
        
        if (vipCustomerDataError) {
          console.error(`[VIP Status API] Error fetching vip_customer_data details for automatic matching:`, vipCustomerDataError);
          return NextResponse.json({
            status: 'linked_unmatched',
            crmCustomerId: null,
            stableHashId: null,
          });
        }
        
        if (vipCustomerData?.vip_phone_number) {
          // Import the matching function
          const { matchProfileWithCrm } = await import('@/utils/customer-matching');
          
          try {
            const matchResult = await matchProfileWithCrm(profileId, {
              phoneNumberToMatch: vipCustomerData.vip_phone_number,
              source: 'automatic_vip_status_background_match',
            });
            
            if (matchResult?.matched && matchResult.stableHashId && matchResult.crmCustomerId) {
              // Update the vip_customer_data with the matched stable_hash_id
              const { error: updateError } = await supabaseUserClient
                .from('vip_customer_data')
                .update({ 
                  stable_hash_id: matchResult.stableHashId,
                  updated_at: new Date().toISOString()
                })
                .eq('id', profileVip.vip_customer_data_id);
              
              if (updateError) {
                console.error(`[VIP Status API] Error updating vip_customer_data with matched stable_hash_id:`, updateError);
                // Continue anyway - the match was successful, just the update failed
              }
              
              // Trigger package sync for the newly matched user
              try {
                const { syncPackagesForProfile } = await import('@/utils/supabase/crm-packages');
                await syncPackagesForProfile(profileId);
              } catch (syncError) {
                console.error(`[VIP Status API] Error syncing packages after automatic match:`, syncError);
                // Don't fail the response - packages can sync later
              }
              
              // Return the matched status
              return NextResponse.json({
                status: 'linked_matched',
                crmCustomerId: matchResult.crmCustomerId,
                stableHashId: matchResult.stableHashId,
              });
            }
          } catch (matchError) {
            console.error(`[VIP Status API] Error during automatic CRM matching:`, matchError);
            // Continue to return linked_unmatched status
          }
        }
        
        // If no match found or no phone number, return linked_unmatched
        return NextResponse.json({
          status: 'linked_unmatched',
          crmCustomerId: null,
          stableHashId: null,
        });
      }
    }
    // --- END: Prioritize vip_customer_data ---

    const { data: mapping, error: mappingError } = await supabaseUserClient
      .from('crm_customer_mapping_vip_staging')
      .select('is_matched, crm_customer_id, stable_hash_id')
      .eq('profile_id', profileId)
      .single();

    if (mappingError) {
      if (mappingError.code === 'PGRST116') { 
        return NextResponse.json({
          status: 'not_linked',
          crmCustomerId: null,
          stableHashId: null,
        });
      } else {
        console.error('[VIP Status API] Error fetching crm_customer_mapping_vip_staging:', JSON.stringify(mappingError, null, 2));
        return NextResponse.json({ error: 'Error fetching link status from database.', details: mappingError.message, code: mappingError.code }, { status: 500 });
      }
    }

    if (!mapping) {
      return NextResponse.json({
        status: 'not_linked',
        crmCustomerId: null,
        stableHashId: null,
      });
    }
    
    if (mapping.is_matched) {
      return NextResponse.json({
        status: 'linked_matched',
        crmCustomerId: mapping.crm_customer_id,
        stableHashId: mapping.stable_hash_id,
      });
    } else {
      // Check if user has any VIP customer data setup
      // If not, they should complete the VIP account setup flow
      if (!profileVip?.vip_customer_data_id) {
        return NextResponse.json({
          status: 'not_linked',
          crmCustomerId: null,
          stableHashId: null,
        });
      }
      
      return NextResponse.json({
        status: 'linked_unmatched',
        crmCustomerId: null, 
        stableHashId: mapping.stable_hash_id,
      });
    }

  } catch (e: any) {
    console.error('[VIP Status API] Unexpected error in GET handler:', e.message, 'Stack:', e.stack);
    return NextResponse.json({ error: 'Internal Server Error in VIP Status API', details: e.message }, { status: 500 });
  }
} 