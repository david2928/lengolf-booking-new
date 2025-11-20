import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'LUCKY-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: NextRequest) {
  try {
    const { lineUserId, customerId } = await request.json();

    // V2: Require customerId (for transaction-based system)
    // V1: Fall back to lineUserId (for backwards compatibility)
    if (!customerId && !lineUserId) {
      return NextResponse.json(
        { error: 'customerId or lineUserId is required' },
        { status: 400 }
      );
    }

    let customerIdToUse = customerId;
    let profile: any = null;

    // If customerId not provided, try to get it from lineUserId (V1 compatibility)
    if (!customerIdToUse && lineUserId) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, phone_number, display_name, customer_id')
        .eq('provider', 'line')
        .eq('provider_id', lineUserId)
        .single();

      if (profileError || !profileData) {
        console.error('[spin] Error fetching profile:', profileError);
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 400 }
        );
      }

      if (!profileData.customer_id) {
        return NextResponse.json(
          { error: 'Customer account not linked. Please contact staff.' },
          { status: 400 }
        );
      }

      customerIdToUse = profileData.customer_id;
      profile = profileData;
    } else {
      // Get profile info for the given customer
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, phone_number, display_name, provider_id')
        .eq('customer_id', customerIdToUse)
        .single();

      if (!profileError && profileData) {
        profile = {
          ...profileData,
          customer_id: customerIdToUse
        };
      }
    }

    // Check if customer has available draws
    const { data: drawBalance, error: drawError } = await supabase
      .from('customer_lucky_draws')
      .select('draws_available, draws_used')
      .eq('customer_id', customerIdToUse)
      .single();

    if (drawError && drawError.code !== 'PGRST116') {
      console.error('[spin] Error checking draw balance:', drawError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!drawBalance || drawBalance.draws_available <= 0) {
      return NextResponse.json(
        { error: 'No draws available. Complete transactions over 500 THB to earn draws!' },
        { status: 400 }
      );
    }

    // Check if campaign still has prizes available
    const { data: campaignActive } = await supabase
      .rpc('campaign_has_prizes');

    if (!campaignActive) {
      return NextResponse.json(
        { error: 'Campaign has ended - all prizes have been claimed! Thank you for participating.' },
        { status: 400 }
      );
    }

    // Calculate next draw sequence number
    const { data: existingSpins, error: countError } = await supabase
      .from('lucky_draw_spins')
      .select('draw_sequence')
      .eq('customer_id', customerIdToUse)
      .order('draw_sequence', { ascending: false })
      .limit(1);

    const nextSequence = existingSpins && existingSpins.length > 0
      ? (existingSpins[0].draw_sequence || 0) + 1
      : 1;

    // Select prize using inventory-based weighted probability
    const { data: selectedPrize, error: prizeError } = await supabase
      .rpc('select_prize_weighted')
      .single();

    if (prizeError || !selectedPrize) {
      console.error('[spin] Error selecting prize:', prizeError);
      return NextResponse.json(
        { error: 'No prizes available. Campaign may have ended.' },
        { status: 500 }
      );
    }

    const redemptionCode = generateRedemptionCode();

    // Insert spin record with customer_id and prize_inventory_id
    const { data: spinRecord, error: insertError } = await supabase
      .from('lucky_draw_spins')
      .insert({
        profile_id: profile?.id || null,
        line_user_id: lineUserId || profile?.provider_id || null,
        customer_id: customerIdToUse,
        phone_number: profile?.phone_number || null,
        display_name: profile?.display_name || null,
        prize_name: selectedPrize.prize_name,
        prize_description: selectedPrize.prize_description,
        redemption_code: redemptionCode,
        prize_inventory_id: selectedPrize.prize_id,
        draw_sequence: nextSequence,
        spin_timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('[spin] Error inserting spin record:', insertError);
      return NextResponse.json(
        { error: 'Failed to record spin' },
        { status: 500 }
      );
    }

    // Decrement prize inventory
    const { data: inventoryDecremented } = await supabase
      .rpc('decrement_prize_inventory', {
        p_prize_id: selectedPrize.prize_id
      });

    if (!inventoryDecremented) {
      console.error('[spin] Failed to decrement inventory for prize:', selectedPrize.prize_id);
      // Prize was awarded but inventory not decremented - log for manual correction
    }

    // Decrement draws_available (increment draws_used)
    const { error: updateError } = await supabase
      .from('customer_lucky_draws')
      .update({
        draws_used: drawBalance.draws_used + 1
      })
      .eq('customer_id', customerIdToUse);

    if (updateError) {
      console.error('[spin] Error updating draw balance:', updateError);
      // Don't fail the request, spin was recorded successfully
    }

    return NextResponse.json({
      success: true,
      prize: selectedPrize.prize_name,
      prizeDescription: selectedPrize.prize_description,
      redemptionCode: redemptionCode,
      spinTimestamp: spinRecord.spin_timestamp,
      drawsRemaining: Math.max(0, drawBalance.draws_available - 1)
    });

  } catch (error) {
    console.error('[spin] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
