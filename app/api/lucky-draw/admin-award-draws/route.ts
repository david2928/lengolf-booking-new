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

    const { customerId, draws } = await request.json();

    if (!customerId) {
      return NextResponse.json(
        { error: 'customerId is required' },
        { status: 400 }
      );
    }

    if (!draws || draws < 1) {
      return NextResponse.json(
        { error: 'draws must be a positive integer' },
        { status: 400 }
      );
    }

    // Award draws using admin function
    const { data, error } = await supabase
      .rpc('admin_award_draws', {
        p_customer_id: customerId,
        p_draws_to_award: draws
      })
      .single<{ customer_id: string; draws_awarded: number; total_draws: number }>();

    if (error) {
      console.error('[admin-award-draws] Error:', error);
      return NextResponse.json(
        { error: 'Failed to award draws' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      customerId: data.customer_id,
      drawsAwarded: data.draws_awarded,
      totalDraws: data.total_draws
    });

  } catch (error) {
    console.error('[admin-award-draws] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
