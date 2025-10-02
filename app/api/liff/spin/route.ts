import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Prize configuration with probabilities
const PRIZES = [
  { name: 'Free Bay Hour', description: 'Enjoy 1 hour of free bay time', probability: 0.10 },
  { name: '10% Discount', description: '10% off your next visit', probability: 0.20 },
  { name: 'Free Drink', description: 'Complimentary beverage of your choice', probability: 0.25 },
  { name: 'Better Luck Next Time', description: 'Thank you for participating!', probability: 0.30 },
  { name: '500 THB Voucher', description: '500 THB voucher for services', probability: 0.05 },
  { name: 'Free Golf Lesson', description: '1 hour free golf lesson with coach', probability: 0.10 }
];

function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'LUCKY-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function selectPrize(): typeof PRIZES[0] {
  const random = Math.random();
  let cumulative = 0;

  for (const prize of PRIZES) {
    cumulative += prize.probability;
    if (random < cumulative) {
      return prize;
    }
  }

  // Fallback (should never reach here if probabilities sum to 1)
  return PRIZES[PRIZES.length - 1];
}

export async function POST(request: NextRequest) {
  try {
    const { lineUserId } = await request.json();

    if (!lineUserId) {
      return NextResponse.json({ error: 'lineUserId is required' }, { status: 400 });
    }

    // Check if user has already played
    const { data: existingSpin, error: spinCheckError } = await supabase
      .from('lucky_draw_spins')
      .select('id')
      .eq('line_user_id', lineUserId)
      .single();

    if (spinCheckError && spinCheckError.code !== 'PGRST116') {
      console.error('[spin] Error checking existing spin:', spinCheckError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (existingSpin) {
      return NextResponse.json(
        { error: 'User has already played' },
        { status: 400 }
      );
    }

    // Get profile with phone number
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, phone_number, display_name')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .single();

    if (profileError || !profile) {
      console.error('[spin] Error fetching profile:', profileError);
      return NextResponse.json(
        { error: 'Profile not found. Please provide phone number first.' },
        { status: 400 }
      );
    }

    if (!profile.phone_number) {
      return NextResponse.json(
        { error: 'Phone number required. Please update your profile.' },
        { status: 400 }
      );
    }

    // Select prize using weighted random
    const selectedPrize = selectPrize();
    const redemptionCode = generateRedemptionCode();

    // Insert spin record
    const { data: spinRecord, error: insertError } = await supabase
      .from('lucky_draw_spins')
      .insert({
        profile_id: profile.id,
        line_user_id: lineUserId,
        phone_number: profile.phone_number,
        display_name: profile.display_name,
        prize_name: selectedPrize.name,
        prize_description: selectedPrize.description,
        redemption_code: redemptionCode,
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

    return NextResponse.json({
      success: true,
      prize: selectedPrize.name,
      prizeDescription: selectedPrize.description,
      redemptionCode: redemptionCode,
      spinTimestamp: spinRecord.spin_timestamp
    });

  } catch (error) {
    console.error('[spin] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
