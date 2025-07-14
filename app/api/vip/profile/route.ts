import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createServerClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

// Simple in-memory cache for profile data
const profileCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

function getCachedProfile(profileId: string) {
  const cached = profileCache.get(profileId);
  if (!cached || Date.now() - cached.timestamp > CACHE_TTL_MS) {
    profileCache.delete(profileId);
    return null;
  }
  return cached.data;
}

function setCachedProfile(profileId: string, data: any) {
  profileCache.set(profileId, { data, timestamp: Date.now() });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileId = session.user.id;
  
  // Check cache first
  const cachedProfile = getCachedProfile(profileId);
  if (cachedProfile) {
    return NextResponse.json(cachedProfile);
  }

  const supabase = createServerClient();
  const adminSupabase = createAdminClient();

  try {
    // Get profile with customer info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, display_name, picture_url, phone_number, customer_id')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // If not linked to customer, return basic profile data
    if (!profile.customer_id) {
      const response = {
        id: profile.id,
        name: profile.display_name,
        email: profile.email,
        phoneNumber: profile.phone_number,
        pictureUrl: profile.picture_url,
        marketingPreference: null,
        customerStatus: 'not_linked',
        customerCode: null,
        vipTier: null,
        dataSource: 'new_customer_system'
      };
      setCachedProfile(profileId, response);
      return NextResponse.json(response);
    }

    // Get customer data including marketing preference
    const { data: customer } = await adminSupabase
      .from('customers')
      .select('customer_code, customer_name, contact_number, email, marketing_opt_in')
      .eq('id', profile.customer_id)
      .single();

    const response = {
      id: profile.id,
      name: customer?.customer_name || profile.display_name,
      email: customer?.email || profile.email,
      phoneNumber: customer?.contact_number || profile.phone_number,
      pictureUrl: profile.picture_url,
      marketingPreference: customer?.marketing_opt_in ?? null,
      customerStatus: 'linked',
      customerCode: customer?.customer_code || null,
      vipTier: null, // VIP tiers removed from new system
      dataSource: 'new_customer_system'
    };

    setCachedProfile(profileId, response);
    return NextResponse.json(response);

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileId = session.user.id;
  const supabase = createServerClient();
  const adminSupabase = createAdminClient();

  try {
    const body = await request.json();
    const { email, display_name, marketingPreference } = body;

    console.log(`[VIP Profile PUT] Update request for ${profileId}:`, {
      email: !!email,
      display_name: !!display_name,
      marketingPreference
    });

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, customer_id')
      .eq('id', profileId)
      .single();

    if (!profile?.customer_id) {
      return NextResponse.json({ error: 'Profile not linked to customer account' }, { status: 400 });
    }

    // Build update payload for customers table
    const updatePayload: any = {};
    const updatedFields: string[] = [];

    if (display_name !== undefined) {
      updatePayload.customer_name = display_name;
      updatedFields.push('name');
    }
    if (email !== undefined) {
      updatePayload.email = email;
      updatedFields.push('email');
    }
    if (marketingPreference !== undefined) {
      updatePayload.marketing_opt_in = marketingPreference;
      updatedFields.push('marketing_preference');
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No changes to update',
        updatedFields: []
      });
    }

    console.log(`[VIP Profile PUT] Updating customer ${profile.customer_id}:`, updatePayload);

    const { error } = await adminSupabase
      .from('customers')
      .update(updatePayload)
      .eq('id', profile.customer_id);

    if (error) {
      console.error(`[VIP Profile PUT] Failed to update customer:`, error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    console.log(`[VIP Profile PUT] Successfully updated fields: ${updatedFields.join(', ')}`);

    // Clear cache and return success with details
    profileCache.delete(profileId);
    return NextResponse.json({ 
      success: true,
      message: `Successfully updated: ${updatedFields.join(', ')}`,
      updatedFields
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}