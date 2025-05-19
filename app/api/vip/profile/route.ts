import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createCrmClient } from '@/utils/supabase/crm'; // For fetching from customers table
import { createClient } from '@supabase/supabase-js'; // Import base Supabase client
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

// Define a type for our session that includes the accessToken and a well-defined user
interface VipProfileSessionUser extends NextAuthUser { // NextAuthUser has id, name, email, image
  id: string; // Ensure id is string and non-optional
  provider?: string; // As in ExtendedUser from authOptions
  phone?: string | null;   // As in ExtendedUser from authOptions
}

interface VipProfileSession extends NextAuthSession {
  accessToken?: string;
  user: VipProfileSessionUser; // Use our more specific user type
}

export async function GET() {
  const session = await getServerSession(authOptions) as VipProfileSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken; // Store for clarity
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Profile API GET] Supabase URL or Anon Key is not set.');
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
  const crmSupabase = createCrmClient();

  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, email, display_name, picture_url, phone_number, vip_customer_data_id')
      .eq('id', profileId)
      .single();

    if (userProfileError) {
      console.error('Error fetching user profile (profiles_vip_staging):', userProfileError);
      return NextResponse.json({ error: 'Error fetching user profile data.' }, { status: 500 });
    }
    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    let vipDisplayName = userProfile.display_name;
    let vipEmail = userProfile.email;
    let vipMarketingPreference: boolean | null = null;
    let stableHashIdToUse: string | null = null;
    let vipPhoneNumber: string | null = null;
    let vipTierInfo: { id: number; name: string; description: string | null } | null = null; // To hold tier details
    
    let finalResolvedPhoneNumber: string | null = userProfile.phone_number ?? null;

    if (userProfile.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await supabaseUserClient
        .from('vip_customer_data')
        // Select new vip_tier_id as well
        .select('vip_display_name, vip_email, vip_marketing_preference, stable_hash_id, vip_phone_number, vip_tier_id') 
        .eq('id', userProfile.vip_customer_data_id)
        .single();

      if (vipDataError) {
        console.warn(`[VIP Profile API GET] Could not fetch vip_customer_data for id ${userProfile.vip_customer_data_id}:`, vipDataError);
      } else if (vipData) {
        vipDisplayName = vipData.vip_display_name ?? vipDisplayName;
        vipEmail = vipData.vip_email ?? vipEmail;
        vipMarketingPreference = vipData.vip_marketing_preference;
        stableHashIdToUse = vipData.stable_hash_id;
        vipPhoneNumber = vipData.vip_phone_number;
        if (vipPhoneNumber !== null) {
            finalResolvedPhoneNumber = vipPhoneNumber;
        }

        // If vip_tier_id is present, fetch tier details
        if (vipData.vip_tier_id) {
          const { data: tierData, error: tierError } = await supabaseUserClient // Can use the same client
            .from('vip_tiers')
            .select('id, tier_name, description')
            .eq('id', vipData.vip_tier_id)
            .single();
          
          if (tierError) {
            console.warn(`[VIP Profile API GET] Could not fetch vip_tier details for tier_id ${vipData.vip_tier_id}:`, tierError);
          } else if (tierData) {
            vipTierInfo = { id: tierData.id, name: tierData.tier_name, description: tierData.description };
          }
        }
      }
    }
    
    let crmStatus: string = 'not_linked';
    let crmCustomerIdFromMapping: string | null = null;
    let finalStableHashId: string | null = stableHashIdToUse;

    if (stableHashIdToUse) {
        const { data: customerData, error: customerError } = await crmSupabase
            .from('customers') 
            .select('contact_number, id, stable_hash_id') 
            .eq('stable_hash_id', stableHashIdToUse) // Query customers table by stable_hash_id
            .maybeSingle();

        if (customerError) {
            console.error('Error fetching CRM customer using stable_hash_id from vip_customer_data:', customerError);
        } else if (customerData) {
            // CRM phone takes highest precedence if found
            if (customerData.contact_number) {
                finalResolvedPhoneNumber = customerData.contact_number;
            }
            crmStatus = 'linked_matched';
            crmCustomerIdFromMapping = customerData.id;
            finalStableHashId = customerData.stable_hash_id; // Ensure this is the one from CRM
        } else {
            crmStatus = 'linked_unmatched'; 
            console.warn(`[VIP Profile API GET] stable_hash_id ${stableHashIdToUse} found in vip_customer_data, but no matching customer in CRM.`);
            // finalResolvedPhoneNumber remains as set from vip_customer_data or profiles_vip_staging in this case
        }
    } else {
        const { data: mapping, error: mappingError } = await supabaseUserClient
          .from('crm_customer_mapping_vip_staging')
          .select('is_matched, crm_customer_id, stable_hash_id')
          .eq('profile_id', profileId)
          .maybeSingle();

        if (mappingError) {
          console.error('Error fetching CRM mapping (crm_customer_mapping_vip_staging):', mappingError);
        } else if (mapping) {
            crmCustomerIdFromMapping = mapping.crm_customer_id;
            finalStableHashId = mapping.stable_hash_id; // Use stable_hash_id from mapping
            if (mapping.is_matched && mapping.stable_hash_id) { // Check stable_hash_id for fetching phone
                const { data: customerData, error: customerError } = await crmSupabase
                    .from('customers')
                    .select('contact_number')
                    .eq('stable_hash_id', mapping.stable_hash_id) // Use stable_hash_id here
                    .single();
                if (customerError) {
                    console.error('Error fetching CRM customer phone from mapping by stable_hash_id:', customerError);
                } else if (customerData && customerData.contact_number) {
                     // CRM phone takes highest precedence if found via mapping
                    finalResolvedPhoneNumber = customerData.contact_number;
                }
                crmStatus = 'linked_matched';
            } else if (mapping.is_matched && mapping.crm_customer_id && !mapping.stable_hash_id) {
                 // Fallback if only crm_customer_id is somehow present and matched, though stable_hash_id is preferred
                const { data: customerData, error: customerError } = await crmSupabase
                    .from('customers')
                    .select('contact_number')
                    .eq('id', mapping.crm_customer_id)
                    .single();
                if (customerError) {
                    console.error('Error fetching CRM customer phone from mapping by crm_customer_id:', customerError);
                } else if (customerData && customerData.contact_number) {
                    // CRM phone takes highest precedence if found via mapping
                    finalResolvedPhoneNumber = customerData.contact_number;
                }
                crmStatus = 'linked_matched';
            } else {
                crmStatus = 'linked_unmatched';
            }
        }
    }

    return NextResponse.json({
      id: userProfile.id,
      name: vipDisplayName,
      email: vipEmail,
      phoneNumber: finalResolvedPhoneNumber,
      pictureUrl: userProfile.picture_url,
      marketingPreference: vipMarketingPreference,
      crmStatus: crmStatus,
      crmCustomerId: crmCustomerIdFromMapping,
      stableHashId: finalStableHashId,
      vipTier: vipTierInfo
    });

  } catch (error) {
    console.error('Unexpected error in GET /api/vip/profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

  const { email: reqEmail, marketingPreference: reqMarketingPreference, display_name: reqDisplayName } = requestBody;
  const updatedFieldsAccumulator: string[] = [];

  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, vip_customer_data_id, display_name, email')
      .eq('id', profileId)
      .single();

    if (userProfileError || !userProfile) {
      console.error('[VIP Profile API PUT] Error fetching user profile:', userProfileError);
      return NextResponse.json({ error: 'User profile not found or error fetching it.' }, { status: userProfileError ? 500 : 404 });
    }

    let targetVipDataId = userProfile.vip_customer_data_id;

    if (!targetVipDataId) {
      // Create new vip_customer_data record
      const { data: newVipData, error: insertVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .insert({
          vip_display_name: reqDisplayName ?? userProfile.display_name,
          vip_email: reqEmail ?? userProfile.email,
          vip_marketing_preference: reqMarketingPreference,
        })
        .select('id')
        .single();

      if (insertVipError || !newVipData) {
        console.error('[VIP Profile API PUT] Error creating vip_customer_data record:', insertVipError);
        return NextResponse.json({ error: 'Failed to create VIP profile data.' }, { status: 500 });
      }
      targetVipDataId = newVipData.id;

      // Link it to profiles_vip_staging
      const { error: updateProfileLinkError } = await supabaseUserClient
        .from('profiles_vip_staging')
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
    } else {
      // Update existing vip_customer_data record
      const vipUpdatePayload: Partial<{
        vip_display_name?: string;
        vip_email?: string;
        vip_marketing_preference?: boolean;
        vip_phone_number?: string | null;
        vip_tier_id?: number | null; // Allow updating vip_tier_id
        updated_at?: string;
      }> = {};

      if (reqDisplayName !== undefined) {
        if (typeof reqDisplayName === 'string') {
          vipUpdatePayload.vip_display_name = reqDisplayName;
          updatedFieldsAccumulator.push('display_name');
        } else {
          return NextResponse.json({ error: 'Invalid display_name format.' }, { status: 400 });
        }
      }
      if (reqEmail !== undefined) {
        if (typeof reqEmail === 'string' && /^[\w\-\.]+@([\w\-]+\.)+[\w\-]{2,4}$/.test(reqEmail)) {
          vipUpdatePayload.vip_email = reqEmail;
          updatedFieldsAccumulator.push('email');
        } else {
          return NextResponse.json({ error: 'Invalid email format.' }, { status: 400 });
        }
      }
      if (reqMarketingPreference !== undefined) {
        if (typeof reqMarketingPreference === 'boolean') {
          vipUpdatePayload.vip_marketing_preference = reqMarketingPreference;
          updatedFieldsAccumulator.push('marketingPreference');
        } else {
          return NextResponse.json({ error: 'Invalid marketingPreference format.' }, { status: 400 });
        }
      }

      if (updatedFieldsAccumulator.length > 0) {
        vipUpdatePayload.updated_at = new Date().toISOString();
        const { error: updateVipError } = await supabaseUserClient
          .from('vip_customer_data')
          .update(vipUpdatePayload)
          .eq('id', targetVipDataId);

        if (updateVipError) {
          console.error('[VIP Profile API PUT] Error updating vip_customer_data:', updateVipError);
          return NextResponse.json({ error: 'Failed to update VIP profile data.' }, { status: 500 });
        }
      }
    }
    
    // Also update profiles_vip_staging.updated_at if any actual VIP data changed,
    // or if only profiles_vip_staging specific fields were intended to be updated (though not the case here).
    if (updatedFieldsAccumulator.length > 0) {
        const { error: touchProfileError } = await supabaseUserClient
            .from('profiles_vip_staging')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', profileId);
        if (touchProfileError) {
             console.warn('[VIP Profile API PUT] Failed to touch profiles_vip_staging.updated_at:', touchProfileError);
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