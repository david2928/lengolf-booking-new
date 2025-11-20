import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const session = await getServerSession(authOptions);

    // TODO: Add proper admin role check when admin system is implemented
    // For now, require any authenticated user (should be restricted to admin only)
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const { customerId, fromDate } = await request.json();

    console.log('[calculate-retroactive] Starting calculation', {
      customerId: customerId || 'all customers',
      fromDate: fromDate || 'all time'
    });

    // Call the database function for retroactive calculation
    const { data, error } = await supabase
      .rpc('calculate_retroactive_draws', {
        p_customer_id: customerId || null,
        p_from_date: fromDate || null
      });

    if (error) {
      console.error('[calculate-retroactive] Error calling function:', error);
      return NextResponse.json(
        { error: 'Failed to calculate retroactive draws' },
        { status: 500 }
      );
    }

    // Count results
    const results = data || [];
    const totalCustomers = results.length;
    const totalDraws = results.reduce((sum: number, row: any) => sum + (row.draws_awarded || 0), 0);

    console.log('[calculate-retroactive] Completed', {
      customersProcessed: totalCustomers,
      drawsAwarded: totalDraws
    });

    return NextResponse.json({
      success: true,
      customersProcessed: totalCustomers,
      drawsAwarded: totalDraws,
      details: results
    });

  } catch (error) {
    console.error('[calculate-retroactive] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
