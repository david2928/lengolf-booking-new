import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import { getRealTimeCustomerForProfile, getProfileCustomerLink } from '@/utils/customer-matching';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

// Define a type for our session that includes the accessToken and a well-defined user
interface VipProfileSessionUser extends NextAuthUser {
  id: string;
  provider?: string;
  phone?: string | null;
}

interface VipProfileSession extends NextAuthSession {
  accessToken?: string;
  user: VipProfileSessionUser;
}

export async function GET() {
  const session = await getServerSession(authOptions) as VipProfileSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Profile API V2] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }

  // Create a user-specific Supabase client
  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  });

  try {
    console.log(`[VIP Profile API V2] Getting profile data for user ${profileId}`);

    // NEW: Get basic profile data
    const { data: profileData, error: profileError } = await supabaseUserClient
      .from('profiles')
      .select(`
        id, 
        email, 
        display_name, 
        picture_url, 
        phone_number,
        vip_customer_data_id,
        vip_customer_data:vip_customer_data_id (
          vip_display_name,
          vip_email,
          vip_marketing_preference,
          vip_phone_number,
          vip_tier_id,
          vip_tiers:vip_tier_id (
            id,
            tier_name,
            description
          )
        )
      `)
      .eq('id', profileId)
      .single();

    if (profileError) {
      console.error('[VIP Profile API V2] Error fetching user profile:', profileError);
      
      if (profileError.code === 'PGRST116') {
        console.warn(`[VIP Profile API V2] Profile not found for session user ${profileId}. This indicates a stale session.`);
        return NextResponse.json({ 
          error: 'Profile not found. Please log in again.', 
          forceLogout: true 
        }, { status: 401 });
      }
      
      return NextResponse.json({ error: 'Error fetching user profile data.' }, { status: 500 });
    }

    if (!profileData) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    // Extract VIP data
    const vipData = Array.isArray(profileData.vip_customer_data) 
      ? profileData.vip_customer_data[0] 
      : profileData.vip_customer_data;
    const tierData = vipData?.vip_tiers 
      ? (Array.isArray(vipData.vip_tiers) ? vipData.vip_tiers[0] : vipData.vip_tiers)
      : null;

    // NEW: Use simplified architecture to get customer link and real-time data
    const profileLink = await getProfileCustomerLink(profileId);
    const customerData = await getRealTimeCustomerForProfile(profileId);

    console.log(`[VIP Profile API V2] Profile link found:`, profileLink ? {
      stableHashId: profileLink.stable_hash_id,
      confidence: profileLink.match_confidence
    } : 'none');

    console.log(`[VIP Profile API V2] Customer data found:`, customerData ? {
      name: customerData.name,
      phone: customerData.phone_number
    } : 'none');

    // Determine display values with priority: VIP data > Profile data
    let displayName = vipData?.vip_display_name || profileData.display_name || null;
    let email = vipData?.vip_email || profileData.email || null;
    let marketingPreference: boolean | null = vipData?.vip_marketing_preference ?? null;
    let vipPhoneNumber: string | null = vipData?.vip_phone_number ?? null;

    // Phone number priority: CRM > VIP > Profile
    let phoneNumber: string | null = customerData?.phone_number || vipPhoneNumber || profileData.phone_number || null;

    // VIP tier info
    let vipTierInfo: { id: number; name: string; description: string | null } | null = null;
    if (tierData) {
      vipTierInfo = { 
        id: tierData.id, 
        name: tierData.tier_name, 
        description: tierData.description 
      };
    }

    // Determine CRM status based on new architecture
    let crmStatus: string;
    let crmCustomerId: string | null = null;
    let stableHashId: string | null = null;

    if (customerData && profileLink) {
      crmStatus = 'linked_matched';
      crmCustomerId = customerData.id;
      stableHashId = customerData.stable_hash_id || null;
    } else if (profileLink) {
      crmStatus = 'linked_unmatched';
      stableHashId = profileLink.stable_hash_id;
    } else {
      crmStatus = 'not_linked';
    }

    const response = {
      id: profileData.id,
      name: displayName,
      email: email,
      phoneNumber: phoneNumber,
      pictureUrl: profileData.picture_url,
      marketingPreference: marketingPreference,
      crmStatus: crmStatus,
      crmCustomerId: crmCustomerId,
      stableHashId: stableHashId,
      vipTier: vipTierInfo,
      dataSource: 'simplified_v2'
    };

    console.log(`[VIP Profile API V2] Returning profile data:`, {
      id: response.id,
      crmStatus: response.crmStatus,
      hasCustomerData: !!customerData,
      hasProfileLink: !!profileLink
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('[VIP Profile API V2] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions) as VipProfileSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Profile API PUT] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }

  // Create a user-specific Supabase client correctly
  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  });

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email: reqEmail, marketingPreference: reqMarketingPreference, display_name: reqDisplayName, vip_phone_number: reqVipPhoneNumber } = requestBody;
  const updatedFieldsAccumulator: string[] = [];

  // Get a Supabase admin client for operations that need to bypass RLS or use service role
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles')
      .select('id, vip_customer_data_id, display_name, email')
      .eq('id', profileId)
      .single();

    if (userProfileError || !userProfile) {
      console.error('[VIP Profile API PUT] Error fetching user profile:', userProfileError);
      return NextResponse.json({ error: 'User profile not found or error fetching it.' }, { status: userProfileError ? 500 : 404 });
    }

    let targetVipDataId = userProfile.vip_customer_data_id;
    let resolvedStableHashId: string | null = null;

    // --- BEGIN: Determine stable_hash_id for the current profileId ---
    try {
      const { data: mappingData, error: mappingError } = await supabaseAdmin // Use admin client for this lookup
        .from('crm_customer_mapping')
        .select('stable_hash_id, is_matched')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (mappingError) {
        console.warn(`[VIP Profile PUT] Error fetching crm_customer_mapping for profile ${profileId}:`, mappingError.message);
      } else if (mappingData?.is_matched && mappingData.stable_hash_id) {
        resolvedStableHashId = mappingData.stable_hash_id;
      }
    } catch (e) {
      console.error('[VIP Profile PUT] Exception fetching stable_hash_id:', e);
    }
    // --- END: Determine stable_hash_id ---

    if (resolvedStableHashId) {
      // A stable_hash_id was found for this profile. Try to find existing vip_customer_data by it.
      const { data: existingVipDataByHash, error: existingVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('id')
        .eq('stable_hash_id', resolvedStableHashId)
        .maybeSingle(); // Use maybeSingle as it might not exist

      if (existingVipError) {
        console.warn(`[VIP Profile PUT] Error checking for existing vip_customer_data by stable_hash_id ${resolvedStableHashId}:`, existingVipError.message);
        // Proceed with current targetVipDataId from profile if lookup fails, risk of creating duplicate if RLS hides it
      }

      if (existingVipDataByHash) {
        targetVipDataId = existingVipDataByHash.id;
        // Ensure the current profile is linked to this correct vip_customer_data record
        if (userProfile.vip_customer_data_id !== targetVipDataId) {
          const { error: profileLinkUpdateError } = await supabaseUserClient
            .from('profiles')
            .update({ vip_customer_data_id: targetVipDataId })
            .eq('id', profileId);
          if (profileLinkUpdateError) {
            console.error(`[VIP Profile PUT] Failed to update profiles.vip_customer_data_id for profile ${profileId} to ${targetVipDataId}:`, profileLinkUpdateError.message);
          }
        }
      } else {
        // No existing vip_customer_data for this stable_hash_id. 
        // If targetVipDataId is also null (profile wasn't linked to any vip_customer_data), we will create one below and set its stable_hash_id.
        // If targetVipDataId is NOT null (profile was linked to an OLD/different vip_customer_data that didn't have this stable_hash_id),
        // the current logic will update that old one. We should ideally update its stable_hash_id or merge.
        // For now, if an existing linked record (targetVipDataId) is present, we let it be updated below,
        // and it will get its stable_hash_id updated there if it was missing.
        console.log(`[VIP Profile PUT] No existing vip_customer_data found for stable_hash_id ${resolvedStableHashId}. A new record will be created if profile is not already linked, or existing linked record will be updated.`);
      }
    }

    if (!targetVipDataId) {
      // Create new vip_customer_data record
      const insertPayload: any = {
        vip_display_name: reqDisplayName ?? userProfile.display_name,
        vip_email: reqEmail ?? userProfile.email,
        vip_marketing_preference: reqMarketingPreference,
        vip_phone_number: reqVipPhoneNumber, // Add vip_phone_number
      };
      if (resolvedStableHashId) {
        insertPayload.stable_hash_id = resolvedStableHashId; // Set stable_hash_id if resolved
      }

      const { data: newVipData, error: insertVipError } = await supabaseAdmin
        .from('vip_customer_data')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insertVipError || !newVipData) {
        console.error('[VIP Profile API PUT] Error creating vip_customer_data record:', insertVipError);
        return NextResponse.json({ error: 'Failed to create VIP profile data.' }, { status: 500 });
      }
      targetVipDataId = newVipData.id;

      // Link it to profiles
      const { error: updateProfileLinkError } = await supabaseUserClient
        .from('profiles')
        .update({ vip_customer_data_id: targetVipDataId, updated_at: new Date().toISOString() })
        .eq('id', profileId);

      if (updateProfileLinkError) {
        console.error('[VIP Profile API PUT] Error linking vip_customer_data to profile:', updateProfileLinkError);
        // Non-fatal for the update of vip_customer_data itself, but log it. User might need to retry.
        // Or, decide if this is a hard failure. For now, proceed to update vip_customer_data.
      }
      // Since it's newly created, all provided fields are "updated"
      if (reqDisplayName !== undefined) updatedFieldsAccumulator.push('display_name');
      if (reqEmail !== undefined) updatedFieldsAccumulator.push('email');
      if (reqMarketingPreference !== undefined) updatedFieldsAccumulator.push('marketingPreference');
      if (reqVipPhoneNumber !== undefined) updatedFieldsAccumulator.push('vip_phone_number');
    } else {
      // Update existing vip_customer_data record
      const updatePayload: any = {};
      if (reqDisplayName !== undefined) updatePayload.vip_display_name = reqDisplayName;
      if (reqEmail !== undefined) updatePayload.vip_email = reqEmail;
      if (reqMarketingPreference !== undefined) updatePayload.vip_marketing_preference = reqMarketingPreference;
      if (reqVipPhoneNumber !== undefined) updatePayload.vip_phone_number = reqVipPhoneNumber; // Add vip_phone_number

      // If the existing record doesn't have a stable_hash_id but we resolved one, update it.
      if (resolvedStableHashId) {
        // Check current stable_hash_id on the record first to avoid unnecessary updates
        const { data: currentVipRecord, error: fetchError } = await supabaseUserClient
            .from('vip_customer_data')
            .select('stable_hash_id')
            .eq('id', targetVipDataId)
            .single();
        if (fetchError) {
            console.warn(`[VIP Profile PUT] Could not fetch current vip_customer_data to check stable_hash_id before update for ID ${targetVipDataId}`);
        }
        if (!currentVipRecord?.stable_hash_id || currentVipRecord.stable_hash_id !== resolvedStableHashId) {
            updatePayload.stable_hash_id = resolvedStableHashId; 
            console.log(`[VIP Profile PUT] Updating stable_hash_id on existing vip_customer_data (ID: ${targetVipDataId}) to ${resolvedStableHashId}`);
        }
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateVipError } = await supabaseUserClient
          .from('vip_customer_data')
          .update(updatePayload)
          .eq('id', targetVipDataId);

        if (updateVipError) {
          console.error('[VIP Profile API PUT] Error updating vip_customer_data:', updateVipError);
          return NextResponse.json({ error: 'Failed to update VIP profile data.' }, { status: 500 });
        }
      }
    }
    
    // Also update profiles.updated_at if any actual VIP data changed,
    // or if only profiles specific fields were intended to be updated (though not the case here).
    if (updatedFieldsAccumulator.length > 0) {
        const { error: touchProfileError } = await supabaseUserClient
            .from('profiles')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', profileId);
        if (touchProfileError) {
             console.warn('[VIP Profile API PUT] Failed to touch profiles.updated_at:', touchProfileError);
        }
    }


    if (updatedFieldsAccumulator.length === 0) {
      return NextResponse.json({ message: 'No valid fields to update or data is the same.', updatedFields: [] }, { status: 200 });
    }

    return NextResponse.json({ success: true, updatedFields: updatedFieldsAccumulator });

  } catch (error) {
    console.error('[VIP Profile API PUT] Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 