import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

interface LinkOrCreateRequest {
  lineUserId: string;
  displayName: string;
  pictureUrl?: string;
  phoneNumber: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: LinkOrCreateRequest = await request.json();
    const { lineUserId, displayName, pictureUrl, phoneNumber } = body;

    // Validate required fields
    if (!lineUserId || !displayName || !phoneNumber) {
      return NextResponse.json(
        { error: 'lineUserId, displayName, and phoneNumber are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Normalize phone number
    const { data: normalizedPhone, error: normalizeError } = await supabase
      .rpc('normalize_phone_number', { phone_input: phoneNumber });

    if (normalizeError || !normalizedPhone) {
      console.error('[LIFF Link/Create] Phone normalization error:', normalizeError);
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Search for existing customer by normalized phone
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, customer_code, customer_name')
      .eq('normalized_phone', normalizedPhone)
      .maybeSingle();

    let customer = existingCustomer;
    let isNewCustomer = false;

    // If customer not found, create new one
    if (!customer) {
      // Get next customer code
      const { data: maxCustomer } = await supabase
        .from('customers')
        .select('customer_code')
        .like('customer_code', 'CUS-%')
        .order('customer_code', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextCustomerNumber = 1;
      if (maxCustomer?.customer_code) {
        const match = maxCustomer.customer_code.match(/CUS-(\d+)/);
        if (match) {
          nextCustomerNumber = parseInt(match[1], 10) + 1;
        }
      }
      const customerCode = `CUS-${nextCustomerNumber}`;

      // Create new customer
      const { data: newCustomer, error: createError } = await supabase
        .from('customers')
        .insert({
          customer_code: customerCode,
          customer_name: displayName,
          contact_number: phoneNumber,
          normalized_phone: normalizedPhone,
          marketing_opt_in: false,
          is_active: true
        })
        .select('id, customer_code, customer_name')
        .single();

      if (createError || !newCustomer) {
        console.error('[LIFF Link/Create] Customer creation error:', createError);
        return NextResponse.json(
          { error: 'Failed to create customer record' },
          { status: 500 }
        );
      }

      customer = newCustomer;
      isNewCustomer = true;
      console.log(`[LIFF Link/Create] Created new customer ${customerCode}`);
    } else {
      console.log(`[LIFF Link/Create] Found existing customer ${customer.customer_code}`);
    }

    // Check if customer is already linked to a different LINE profile
    const { data: customerProfiles } = await supabase
      .from('profiles')
      .select('id, provider, provider_id')
      .eq('customer_id', customer.id)
      .eq('provider', 'line');

    // Check if any LINE profile exists with a different LINE user ID
    const otherLineProfile = customerProfiles?.find(
      (profile) => profile.provider_id && profile.provider_id !== lineUserId
    );

    if (otherLineProfile) {
      console.error(`[LIFF Link/Create] Customer ${customer.customer_code} already linked to LINE profile ${otherLineProfile.id} (${otherLineProfile.provider_id})`);
      return NextResponse.json(
        {
          error: `This phone number is already linked to another LINE account. Please contact staff if you believe this is an error.`,
          code: 'CUSTOMER_ALREADY_LINKED'
        },
        { status: 409 }
      );
    }

    // Create or update profile
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();

    if (existingProfile) {
      // Update existing profile with customer_id
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          customer_id: customer.id,
          display_name: displayName,
          picture_url: pictureUrl || null,
          phone_number: phoneNumber
        })
        .eq('id', existingProfile.id);

      if (updateError) {
        console.error('[LIFF Link/Create] Profile update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update profile' },
          { status: 500 }
        );
      }

      console.log(`[LIFF Link/Create] Updated profile ${existingProfile.id} with customer ${customer.customer_code}`);
    } else {
      // Create new profile - generate UUID
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: crypto.randomUUID(),
          provider: 'line',
          provider_id: lineUserId,
          display_name: displayName,
          picture_url: pictureUrl || null,
          phone_number: phoneNumber,
          customer_id: customer.id,
          marketing_preference: false
        });

      if (insertError) {
        console.error('[LIFF Link/Create] Profile creation error:', insertError);
        return NextResponse.json(
          { error: 'Failed to create profile' },
          { status: 500 }
        );
      }

      console.log(`[LIFF Link/Create] Created new profile for LINE user ${lineUserId}`);
    }

    return NextResponse.json({
      success: true,
      isNewCustomer,
      customer: {
        id: customer.id,
        customerCode: customer.customer_code,
        customerName: customer.customer_name
      }
    });

  } catch (error) {
    console.error('[LIFF Link/Create] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
