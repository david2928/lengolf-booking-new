import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createAdminClient } from '@/utils/supabase/admin';


export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profileId = session.user.id;

    // Check if profile is linked to a customer in the new system
    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', profileId)
      .single();
    
    if (profile?.customer_id) {
      // Profile is linked to a customer - get customer info
      const { data: customer } = await supabase
        .from('customers')
        .select('customer_code, customer_name')
        .eq('id', profile.customer_id)
        .single();

      if (customer) {
        return NextResponse.json({
          status: 'linked_matched',
          crmCustomerId: customer.customer_code,
          stableHashId: null, // Deprecated field
          dataSource: 'customer_service_v3'
        });
      }
    }

    return NextResponse.json({
      status: 'not_linked',
      crmCustomerId: null,
      stableHashId: null,
      dataSource: 'customer_service_v3'
    });

  } catch (error) {
    console.error('[VIP Status API V3] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 