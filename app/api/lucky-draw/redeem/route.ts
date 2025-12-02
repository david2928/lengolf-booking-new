import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { prizeId, staffName } = await request.json();

    if (!prizeId) {
      return NextResponse.json(
        { error: 'prizeId is required' },
        { status: 400 }
      );
    }

    if (!staffName || staffName.trim() === '') {
      return NextResponse.json(
        { error: 'staffName is required' },
        { status: 400 }
      );
    }

    // Check if prize exists and is not already redeemed
    const { data: prize, error: fetchError } = await supabase
      .from('lucky_draw_spins')
      .select('id, prize_name, is_redeemed')
      .eq('id', prizeId)
      .single();

    if (fetchError || !prize) {
      console.error('[redeem] Prize not found:', fetchError);
      return NextResponse.json(
        { error: 'Prize not found' },
        { status: 404 }
      );
    }

    if (prize.is_redeemed) {
      return NextResponse.json(
        { error: 'Prize has already been redeemed' },
        { status: 400 }
      );
    }

    // Check if redemption is within valid collection period (Dec 7-31, 2025)
    const now = new Date();
    const startDate = new Date('2025-12-07T00:00:00+07:00'); // Dec 7, 2025 00:00 Bangkok time
    const endDate = new Date('2025-12-31T23:59:59+07:00');   // Dec 31, 2025 23:59 Bangkok time

    if (now < startDate) {
      return NextResponse.json(
        { error: 'Prize collection starts on December 7, 2025' },
        { status: 400 }
      );
    }

    if (now > endDate) {
      return NextResponse.json(
        { error: 'Prize collection period ended on December 31, 2025' },
        { status: 400 }
      );
    }

    // Update prize as redeemed (no authentication required, trust-based)
    const redeemedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('lucky_draw_spins')
      .update({
        is_redeemed: true,
        redeemed_at: redeemedAt,
        redeemed_by_staff_name: staffName.trim()
      })
      .eq('id', prizeId);

    if (updateError) {
      console.error('[redeem] Error updating prize:', updateError);
      return NextResponse.json(
        { error: 'Failed to redeem prize' },
        { status: 500 }
      );
    }

    console.log(`[redeem] Prize ${prizeId} (${prize.prize_name}) redeemed by staff: ${staffName}`);

    return NextResponse.json({
      success: true,
      redeemedAt,
      staffName: staffName.trim(),
      prizeName: prize.prize_name
    });

  } catch (error) {
    console.error('[redeem] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
