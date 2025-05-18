import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { matchProfileWithCrm } from '@/utils/customer-matching';
import { createClient } from '@supabase/supabase-js';

interface LinkAccountSessionUser {
  id: string;
  name?: string | null; 
  email?: string | null;
}
interface LinkAccountSession {
  accessToken?: string;
  user: LinkAccountSessionUser;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions) as LinkAccountSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Link Account API] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    },
  });

  let phoneNumber: string;
  let requestName: string | undefined;
  let requestEmail: string | undefined;
  let requestVipPhoneNumber: string | undefined | null;

  try {
    const body = await request.json();
    phoneNumber = body.phoneNumber;
    requestName = body.name;
    requestEmail = body.email;
    requestVipPhoneNumber = body.vip_phone_number;

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json({ error: 'Phone number is required and must be a string.' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    // --- Step 1: Attempt CRM Match ---
    const matchResult = await matchProfileWithCrm(profileId, {
      phoneNumberToMatch: phoneNumber,
      source: 'manual_link_vip_ui',
    });

    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, vip_customer_data_id, display_name, email, phone_number')
      .eq('id', profileId)
      .single();

    if (userProfileError || !userProfile) {
      console.error('[VIP Link Account API] Error fetching user profile:', userProfileError);
      return NextResponse.json({ error: 'User profile not found or error fetching it.' }, { status: 500 });
    }

    let currentVipDataId = userProfile.vip_customer_data_id;
    let currentVipData: any = null;

    if (currentVipDataId) {
      const { data, error } = await supabaseUserClient
        .from('vip_customer_data')
        .select('*')
        .eq('id', currentVipDataId)
        .single();
      if (error) {
        console.warn(`[VIP Link Account API] Could not fetch existing vip_customer_data ${currentVipDataId}, will attempt to create. Error:`, error);
        currentVipDataId = null;
      } else {
        currentVipData = data;
      }
    }

    if (!currentVipDataId) {
      const { data: newVipData, error: insertVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .insert({
          vip_display_name: requestName ?? userProfile.display_name,
          vip_email: requestEmail ?? userProfile.email,
          vip_phone_number: requestVipPhoneNumber ?? userProfile.phone_number,
          stable_hash_id: null,
        })
        .select('*')
        .single();

      if (insertVipError || !newVipData) {
        console.error('[VIP Link Account API] Error creating vip_customer_data record:', insertVipError);
        return NextResponse.json({ error: 'Failed to ensure VIP profile data for linking.' }, { status: 500 });
      }
      currentVipData = newVipData;
      currentVipDataId = newVipData.id;

      const { error: updateProfileLinkError } = await supabaseUserClient
        .from('profiles_vip_staging')
        .update({ vip_customer_data_id: currentVipDataId, updated_at: new Date().toISOString() })
        .eq('id', profileId);
      if (updateProfileLinkError) {
        console.error('[VIP Link Account API] Error linking new vip_customer_data to profile:', updateProfileLinkError);
      }
    }

    if (matchResult?.matched && matchResult.stableHashId) {
      const matchedStableHashId = matchResult.stableHashId;

      const { data: existingVipDataForCrm, error: existingVipCheckError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('*')
        .eq('stable_hash_id', matchedStableHashId)
        .neq('id', currentVipDataId)
        .limit(1)
        .single();
      
      if (existingVipCheckError && existingVipCheckError.code !== 'PGRST116') {
         console.error('[VIP Link Account API] Error checking for existing VIP data for CRM link:', existingVipCheckError);
      }

      if (existingVipDataForCrm) {
        console.log(`[VIP Link Account API] Unifying: Profile ${profileId} will use existing vip_customer_data ${existingVipDataForCrm.id} linked to CRM stable_hash_id ${matchedStableHashId}`);
        const { error: updateProfileToExistingVipDataError } = await supabaseUserClient
          .from('profiles_vip_staging')
          .update({ vip_customer_data_id: existingVipDataForCrm.id, updated_at: new Date().toISOString() })
          .eq('id', profileId);
        if (updateProfileToExistingVipDataError) {
            console.error('[VIP Link Account API] Error updating profile to use existing_vip_data_for_crm:', updateProfileToExistingVipDataError);
        }
        if (existingVipDataForCrm.stable_hash_id !== matchedStableHashId) {
            await supabaseUserClient.from('vip_customer_data').update({ stable_hash_id: matchedStableHashId }).eq('id', existingVipDataForCrm.id);
        }

      } else {
        console.log(`[VIP Link Account API] No CRM match for profile ${profileId} with phone ${phoneNumber}. VIP data ID: ${currentVipDataId}`);
        const { error: updateCurrentVipDataError } = await supabaseUserClient
          .from('vip_customer_data')
          .update({ stable_hash_id: matchedStableHashId, updated_at: new Date().toISOString() })
          .eq('id', currentVipDataId!);
         if (updateCurrentVipDataError) {
            console.error('[VIP Link Account API] Error updating current_vip_data with stable_hash_id:', updateCurrentVipDataError);
         }
      }
      
      return NextResponse.json({
        success: true,
        crmCustomerId: matchResult.crmCustomerId,
        stableHashId: matchedStableHashId,
      });
    } else {
      console.log(`[VIP Link Account API] No CRM match for profile ${profileId} with phone ${phoneNumber}. VIP data ID: ${currentVipDataId}`);
      return NextResponse.json(
        { success: false, error: 'No matching customer account found.' },
        { status: 404 }
      );
    }
  } catch (error: any) {
    console.error('Error during manual account linking:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
} 