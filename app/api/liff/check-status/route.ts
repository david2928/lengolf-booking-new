import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lineUserId = searchParams.get('lineUserId');

    if (!lineUserId) {
      return NextResponse.json({ error: 'lineUserId is required' }, { status: 400 });
    }

    // Check if user has already played
    const { data: spinRecord, error: spinError } = await supabase
      .from('lucky_draw_spins')
      .select('*')
      .eq('line_user_id', lineUserId)
      .single();

    if (spinError && spinError.code !== 'PGRST116') {
      console.error('[check-status] Error checking spin record:', spinError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // If user has already played, return their previous result
    if (spinRecord) {
      return NextResponse.json({
        hasPlayed: true,
        prize: spinRecord.prize_name,
        prizeDescription: spinRecord.prize_description,
        redemptionCode: spinRecord.redemption_code,
        spinTimestamp: spinRecord.spin_timestamp,
        isRedeemed: spinRecord.is_redeemed
      });
    }

    // User hasn't played yet - check if they have a profile with phone number
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, phone_number')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[check-status] Error checking profile:', profileError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Determine if we need to collect phone number
    const needsPhone = !profile || !profile.phone_number;

    return NextResponse.json({
      hasPlayed: false,
      needsPhone,
      profileExists: !!profile
    });

  } catch (error) {
    console.error('[check-status] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
