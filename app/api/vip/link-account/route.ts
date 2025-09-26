import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createAdminClient } from '@/utils/supabase/admin';

interface LinkAccountSessionUser {
  id: string;
  name?: string | null; 
  email?: string | null;
}
interface LinkAccountSession {
  user: LinkAccountSessionUser;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions) as LinkAccountSession | null;

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileId = session.user.id;

  let phoneNumber: string;

  try {
    const body = await request.json();
    phoneNumber = body.phoneNumber;

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json({ error: 'Phone number is required and must be a string.' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    console.log(`[VIP Link Account API V3] Attempting to link profile ${profileId} with phone ${phoneNumber}`);

    const supabase = createAdminClient();

    // Check if profile is already linked
    const { data: profile } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', profileId)
      .single();

    if (profile?.customer_id) {
      // Profile already linked - get customer info
      const { data: customer } = await supabase
        .from('customers')
        .select('customer_code, customer_name')
        .eq('id', profile.customer_id)
        .single();

      if (customer) {
        console.log(`[VIP Link Account API V3] Profile already linked to customer ${customer.customer_code}`);
        return NextResponse.json({
          success: true,
          message: 'Your account is already linked to a customer record.',
          status: 'linked_matched',
          crmCustomerId: customer.customer_code,
          stableHashId: null,
          dataSource: 'customer_service_v3'
        });
      }
    }

    // Look for customer by normalized phone
    const { data: normalizedPhone } = await supabase
      .rpc('normalize_phone_number', { phone_input: phoneNumber });

    const { data: customer } = await supabase
      .from('customers')
      .select('id, customer_code, customer_name')
      .eq('normalized_phone', normalizedPhone)
      .single();

    if (customer) {
      // Found customer - link the profile
      const { error: linkError } = await supabase
        .from('profiles')
        .update({ customer_id: customer.id })
        .eq('id', profileId);

      if (linkError) {
        console.error(`[VIP Link Account API V3] Failed to link profile:`, linkError);
        return NextResponse.json({ error: 'Failed to create customer link.' }, { status: 500 });
      }

      console.log(`[VIP Link Account API V3] Successfully linked profile ${profileId} to customer ${customer.customer_code}`);
      return NextResponse.json({
        success: true,
        message: 'Excellent! Your account is now connected. You have full access to view your booking history, manage future bookings, view your lesson packages, and enjoy all VIP features.',
        status: 'linked_matched',
        crmCustomerId: customer.customer_code,
        stableHashId: null,
        dataSource: 'customer_service_v3'
      });
    } else {
      console.log(`[VIP Link Account API V3] No customer found for phone ${phoneNumber}`);
      
      return NextResponse.json({
        error: 'No matching customer account found with that phone number. Please check the number and try again, or contact us if you believe this is an error.'
      }, { status: 404 });
    }

  } catch (error) {
    console.error('[VIP Link Account API V3] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 