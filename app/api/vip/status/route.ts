import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/utils/supabase/admin';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

interface VipStatusSessionUser extends NextAuthUser {
  id: string;
}

interface VipStatusSession extends NextAuthSession {
  accessToken?: string;
  user: VipStatusSessionUser;
}


export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions) as VipStatusSession | null;

    if (!session?.user?.id || !session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
    }

    const profileId = session.user.id;

    console.log(`[VIP Status API V3] Checking status for profile ${profileId}`);

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
        console.log(`[VIP Status API V3] Profile linked to customer: ${customer.customer_code}`);
        return NextResponse.json({
          status: 'linked_matched',
          crmCustomerId: customer.customer_code,
          stableHashId: null, // Deprecated field
          dataSource: 'customer_service_v3'
        });
      }
    }

    console.log(`[VIP Status API V3] Profile not linked to any customer`);
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