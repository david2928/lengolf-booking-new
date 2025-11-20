import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        { error: 'customerId is required' },
        { status: 400 }
      );
    }

    // Fetch customer's draw balance
    const { data: drawBalance } = await supabase
      .from('customer_lucky_draws')
      .select('draws_earned, draws_used, draws_available')
      .eq('customer_id', customerId)
      .single();

    // If no record exists, customer has 0 draws
    const draws = drawBalance || {
      draws_earned: 0,
      draws_used: 0,
      draws_available: 0
    };

    // Check if campaign is still active
    const { data: campaignActive } = await supabase
      .rpc('campaign_has_prizes');

    // Fetch all prizes won by this customer
    const { data: prizes, error: prizesError } = await supabase
      .from('lucky_draw_spins')
      .select(`
        id,
        prize_name,
        prize_description,
        redemption_code,
        spin_timestamp,
        is_redeemed,
        redeemed_at,
        redeemed_by_staff_name,
        draw_sequence
      `)
      .eq('customer_id', customerId)
      .order('spin_timestamp', { ascending: false });

    if (prizesError) {
      console.error('[customer-status] Error fetching prizes:', prizesError);
      return NextResponse.json(
        { error: 'Failed to fetch prizes' },
        { status: 500 }
      );
    }

    // Return combined data
    return NextResponse.json({
      draws_available: draws.draws_available,
      draws_used: draws.draws_used,
      draws_earned: draws.draws_earned,
      prizes: prizes || [],
      campaignActive: campaignActive || false
    });

  } catch (error) {
    console.error('[customer-status] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
