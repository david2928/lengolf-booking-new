import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineUserId = searchParams.get('lineUserId');

    if (!lineUserId) {
      return NextResponse.json(
        { error: 'lineUserId is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Query profile by LINE provider_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, customer_id, display_name')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();

    if (profileError) {
      console.error('[LIFF Membership Status] Profile query error:', profileError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }

    // If no profile or no customer_id, user is not linked
    if (!profile || !profile.customer_id) {
      return NextResponse.json({
        status: 'not_linked'
      });
    }

    // Profile is linked - get customer info
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, customer_code, customer_name')
      .eq('id', profile.customer_id)
      .single();

    if (customerError || !customer) {
      console.error('[LIFF Membership Status] Customer query error:', customerError);
      // Profile has customer_id but customer not found - treat as not linked
      return NextResponse.json({
        status: 'not_linked'
      });
    }

    return NextResponse.json({
      status: 'linked',
      customer: {
        id: customer.id,
        customerCode: customer.customer_code,
        customerName: customer.customer_name
      }
    });

  } catch (error) {
    console.error('[LIFF Membership Status] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
