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
      source: 'manual_link_vip_ui_phone_v2',
    });

    // --- Step 2: Fetch current profile details, including its current vip_customer_data_id ---
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles')
      .select('id, vip_customer_data_id, display_name, email, phone_number')
      .eq('id', profileId)
      .single();

    if (userProfileError || !userProfile) {
      console.error('[VIP Link Account API] Error fetching user profile:', userProfileError);
      return NextResponse.json({ error: 'User profile not found or error fetching it.' }, { status: userProfileError ? 500 : 404 });
    }

    if (matchResult?.matched && matchResult.stableHashId && matchResult.crmCustomerId) {
      const matchedStableHashId = matchResult.stableHashId;
      const matchedCrmCustomerId = matchResult.crmCustomerId;

      // --- Step 3: Check if a vip_customer_data record already exists for this matchedStableHashId ---
      const { data: existingVcdByHash, error: existingVcdError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('id, stable_hash_id')
        .eq('stable_hash_id', matchedStableHashId)
        .maybeSingle();

      if (existingVcdError) {
        console.error(`[VIP Link Account API] Error checking for existing vip_customer_data by hash ${matchedStableHashId}:`, existingVcdError.message);
      }

      if (existingVcdByHash) {
        // --- Case A: A vip_customer_data record already exists for this CRM customer (via stable_hash_id) ---
        
        // Ensure the current profile is linked to this definitive vip_customer_data record.
        if (userProfile.vip_customer_data_id !== existingVcdByHash.id) {
          const { error: profileLinkUpdateError } = await supabaseUserClient
            .from('profiles')
            .update({ vip_customer_data_id: existingVcdByHash.id, updated_at: new Date().toISOString() })
            .eq('id', profileId);
          if (profileLinkUpdateError) {
            console.error(`[VIP Link Account API] Failed to update profiles.vip_customer_data_id for profile ${profileId} to ${existingVcdByHash.id}:`, profileLinkUpdateError.message);
          }
        }
         // Ensure the existing record indeed has the correct stable_hash_id (it should, but double check)
        if (existingVcdByHash.stable_hash_id !== matchedStableHashId) {
            console.warn(`[VIP Link Account API] Correcting stable_hash_id on existingVcdByHash (ID: ${existingVcdByHash.id}) from ${existingVcdByHash.stable_hash_id} to ${matchedStableHashId}.`);
            await supabaseUserClient.from('vip_customer_data').update({ stable_hash_id: matchedStableHashId }).eq('id', existingVcdByHash.id);
        }

      } else {
        // --- Case B: No vip_customer_data record found for matchedStableHashId. Need to update current or create. ---
        let targetVipDataId = userProfile.vip_customer_data_id;

        if (targetVipDataId) {
          // Profile is already linked to some vip_customer_data. Update this one with the matchedStableHashId.
          const { error: updateError } = await supabaseUserClient
            .from('vip_customer_data')
            .update({ stable_hash_id: matchedStableHashId, updated_at: new Date().toISOString() })
            .eq('id', targetVipDataId);
          if (updateError) {
            console.error(`[VIP Link Account API] Error updating existing vip_customer_data (ID: ${targetVipDataId}) with stable_hash_id:`, updateError.message);
          }
        } else {
          // Profile is not linked to any vip_customer_data. Create a new one.
          const vipDataToInsert = {
            vip_display_name: requestName ?? userProfile.display_name,
            vip_email: requestEmail ?? userProfile.email,
            vip_phone_number: requestVipPhoneNumber ?? userProfile.phone_number,
            stable_hash_id: matchedStableHashId,
          };
          const { data: newVipData, error: insertError } = await supabaseUserClient
            .from('vip_customer_data')
            .insert(vipDataToInsert)
            .select('id')
            .single();

          if (insertError || !newVipData) {
            console.error('[VIP Link Account API] Error creating new vip_customer_data record:', insertError);
            return NextResponse.json({ error: 'Failed to create VIP profile data for linking.' }, { status: 500 });
          }
          targetVipDataId = newVipData.id;

          // Link the new vip_customer_data record to the profile.
          const { error: profileLinkUpdateError } = await supabaseUserClient
            .from('profiles')
            .update({ vip_customer_data_id: targetVipDataId, updated_at: new Date().toISOString() })
            .eq('id', profileId);
          if (profileLinkUpdateError) {
            console.error(`[VIP Link Account API] Error linking newly created vip_customer_data (ID: ${targetVipDataId}) to profile ${profileId}:`, profileLinkUpdateError.message);
          }
        }
      }
      
      // --- Step 4: Migrate existing bookings to include stable_hash_id ---
      try {
        // Update any existing bookings that have this user_id but no stable_hash_id
        const { data: updatedBookings, error: bookingUpdateError } = await supabaseUserClient
          .from('bookings')
          .update({ stable_hash_id: matchedStableHashId })
          .eq('user_id', profileId)
          .is('stable_hash_id', null)
          .select('id');

        if (bookingUpdateError) {
          console.error(`[VIP Link Account API] Error updating bookings with stable_hash_id for profile ${profileId}:`, bookingUpdateError.message);
        } else if (updatedBookings && updatedBookings.length > 0) {
          console.log(`[VIP Link Account API] Successfully updated ${updatedBookings.length} existing bookings with stable_hash_id for profile ${profileId}`);
        }
      } catch (bookingMigrationError) {
        console.error(`[VIP Link Account API] Unexpected error during booking migration for profile ${profileId}:`, bookingMigrationError);
        // Don't fail the entire operation if booking migration fails
      }

      // Regardless of path (A or B), if we reached here, link is considered successful
      return NextResponse.json({
        success: true,
        message: 'Excellent! Your account is now connected. You have full access to view your booking history, manage future bookings, view your lesson packages, and enjoy all VIP features.',
        status: 'linked_matched',
        crmCustomerId: matchedCrmCustomerId,
        stableHashId: matchedStableHashId,
      });

    } else {
      // --- Case C: No CRM Match Found - Create Placeholder VIP Account ---
      
      // For completely new customers who don't exist in CRM yet, we should create a placeholder VIP account
      // This allows them to use VIP features and will be automatically linked when they make their first booking
      
      let targetVipDataId = userProfile.vip_customer_data_id;

      if (targetVipDataId) {
        // Profile already has a vip_customer_data record, update it with the new phone number
        const { error: updateError } = await supabaseUserClient
          .from('vip_customer_data')
          .update({ 
            vip_phone_number: requestVipPhoneNumber ?? phoneNumber,
            vip_display_name: requestName ?? userProfile.display_name,
            vip_email: requestEmail ?? userProfile.email,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetVipDataId);
        if (updateError) {
          console.error(`[VIP Link Account API] Error updating existing vip_customer_data (ID: ${targetVipDataId}) with new phone number:`, updateError.message);
        }
      } else {
        // Profile is not linked to any vip_customer_data. Create a new placeholder one.
        const vipDataToInsert = {
          vip_display_name: requestName ?? userProfile.display_name,
          vip_email: requestEmail ?? userProfile.email,
          vip_phone_number: requestVipPhoneNumber ?? phoneNumber,
          // stable_hash_id remains null for placeholder accounts
        };
        const { data: newVipData, error: insertError } = await supabaseUserClient
          .from('vip_customer_data')
          .insert(vipDataToInsert)
          .select('id')
          .single();

        if (insertError || !newVipData) {
          console.error('[VIP Link Account API] Error creating new placeholder vip_customer_data record:', insertError);
          return NextResponse.json({ error: 'Failed to create VIP profile data.' }, { status: 500 });
        }
        targetVipDataId = newVipData.id;

        // Link the new vip_customer_data record to the profile.
        const { error: profileLinkUpdateError } = await supabaseUserClient
          .from('profiles')
          .update({ vip_customer_data_id: targetVipDataId, updated_at: new Date().toISOString() })
          .eq('id', profileId);
        if (profileLinkUpdateError) {
          console.error(`[VIP Link Account API] Error linking newly created placeholder vip_customer_data (ID: ${targetVipDataId}) to profile ${profileId}:`, profileLinkUpdateError.message);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Your VIP account has been created! While we couldn\'t find an existing customer record with that phone number, you can still access VIP features. Your account will be automatically linked when you make your first booking.',
        status: 'linked_unmatched',
        crmCustomerId: null,
        stableHashId: null,
      });
    }

  } catch (error) {
    console.error('[VIP Link Account API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 