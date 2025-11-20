import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Get overall campaign status
    const { data: status, error: statusError } = await supabase
      .rpc('get_campaign_status')
      .single<{ total_prizes: number; prizes_remaining: number; prizes_awarded: number; is_active: boolean; prize_breakdown: unknown }>();

    if (statusError) {
      console.error('[campaign-status] Error fetching status:', statusError);
      return NextResponse.json(
        { error: 'Failed to fetch campaign status' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      totalPrizes: status.total_prizes,
      prizesRemaining: status.prizes_remaining,
      prizesAwarded: status.prizes_awarded,
      isActive: status.is_active,
      percentageAwarded: status.total_prizes > 0
        ? Math.round((status.prizes_awarded / status.total_prizes) * 100)
        : 0,
      prizeBreakdown: status.prize_breakdown
    });

  } catch (error) {
    console.error('[campaign-status] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
