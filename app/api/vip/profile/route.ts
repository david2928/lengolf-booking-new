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
    // 1. Fetch from profiles_vip_staging table
    const { data: profileData, error: profileError } = await supabaseUserClient
      .from('profiles_vip_staging') // Corrected table name
      .select('id, email, display_name, picture_url, marketing_preference, phone_number') // Removed 'name'
      .eq('id', profileId)
      .single();

    if (profileError) {
      console.error('Error fetching profile (profiles_vip_staging):', profileError);
      return NextResponse.json({ error: 'Error fetching profile data.' }, { status: 500 });
    }
    if (!profileData) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    let customerPhoneNumber: string | null = null;

    // 2. Fetch CRM mapping from crm_customer_mapping_vip_staging
    const { data: mapping, error: mappingError } = await supabaseUserClient // Use user client for consistency if RLS applies here too
      .from('crm_customer_mapping_vip_staging') // Corrected table name
      .select('is_matched, crm_customer_id, stable_hash_id')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (mappingError) {
      console.error('Error fetching CRM mapping (crm_customer_mapping_vip_staging):', mappingError);
      // Non-fatal, proceed with profile data
    }

    // 3. If matched, fetch phone from customers table (via crmSupabase client)
    if (mapping?.is_matched && mapping.crm_customer_id) {
      const { data: customerData, error: customerError } = await crmSupabase
        .from('customers')
        .select('contact_number')
        .eq('id', mapping.crm_customer_id)
        .single();

      if (customerError) {
        console.error('Error fetching CRM customer phone:', customerError);
      } else if (customerData) {
        customerPhoneNumber = customerData.contact_number;
      }
    }

    const responsePhoneNumber = customerPhoneNumber || profileData.phone_number || null;

    return NextResponse.json({
      id: profileData.id,
      name: profileData.display_name, // Rely solely on display_name
      email: profileData.email,
      phoneNumber: responsePhoneNumber,
      pictureUrl: profileData.picture_url,
      marketingPreference: profileData.marketing_preference,
      crmStatus: mapping ? (mapping.is_matched ? 'linked_matched' : 'linked_unmatched') : 'not_linked',
      crmCustomerId: mapping?.crm_customer_id || null,
      stableHashId: mapping?.stable_hash_id || null,
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
  const userAccessToken = session.accessToken; // Store for clarity
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

  const { email, marketingPreference, display_name } = requestBody;
  const updateData: Partial<{
    email?: string;
    marketing_preference?: boolean;
    display_name?: string;
    updated_at?: string; // Add updated_at
  }> = {};
  const updatedFields: string[] = [];

  if (display_name !== undefined) {
    if (typeof display_name === 'string') {
      updateData.display_name = display_name;
      updatedFields.push('display_name');
    } else {
      return NextResponse.json({ error: 'Invalid display_name format.' }, { status: 400 });
    }
  }

  if (email !== undefined) {
    // Corrected regex with escaped hyphens
    if (typeof email === 'string' && /^[\w\-\.]+@([\w\-]+\.)+[\w\-]{2,4}$/.test(email)) {
      updateData.email = email;
      updatedFields.push('email');
    } else {
      return NextResponse.json({ error: 'Invalid email format.' }, { status: 400 });
    }
  }

  if (marketingPreference !== undefined) {
    if (typeof marketingPreference === 'boolean') {
      updateData.marketing_preference = marketingPreference;
      updatedFields.push('marketingPreference');
    } else {
      return NextResponse.json({ error: 'Invalid marketingPreference format.' }, { status: 400 });
    }
  }

  if (updatedFields.length === 0) {
    return NextResponse.json({ message: 'No fields to update.', updatedFields: [] }, { status: 200 });
  }
  
  updateData.updated_at = new Date().toISOString(); // Always update timestamp

  try {
    const { error: updateError } = await supabaseUserClient
      .from('profiles_vip_staging') // Corrected table name
      .update(updateData)
      .eq('id', profileId);

    if (updateError) {
      console.error('Error updating profile (profiles_vip_staging):', updateError);
      return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, updatedFields });

  } catch (error) {
    console.error('Unexpected error in PUT /api/vip/profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 