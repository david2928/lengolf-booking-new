import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * LIFF Has-Bookings Endpoint
 * Checks if a LINE user has any previous bookings to determine new-customer promotion eligibility.
 * Uses lineUserId (LINE provider_id) instead of NextAuth session.
 */
export async function GET(request: NextRequest) {
  try {
    const lineUserId = request.nextUrl.searchParams.get('lineUserId');

    if (!lineUserId) {
      return NextResponse.json(
        { error: 'lineUserId is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Look up profile by LINE provider_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();

    if (profileError) {
      console.error('[LIFF Has Bookings] Profile query error:', profileError);
      // On error, assume has bookings to avoid showing promotion incorrectly
      return NextResponse.json({ hasBookings: true });
    }

    // No profile found — no bookings possible
    if (!profile) {
      return NextResponse.json({ hasBookings: false });
    }

    // Check bookings by profile.id (user_id) OR customer_id
    let query = supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true });

    if (profile.customer_id) {
      query = query.or(`user_id.eq.${profile.id},customer_id.eq.${profile.customer_id}`);
    } else {
      query = query.eq('user_id', profile.id);
    }

    const { count, error } = await query;

    if (error) {
      console.error('[LIFF Has Bookings] Bookings query error:', error);
      // On error, assume has bookings to avoid showing promotion incorrectly
      return NextResponse.json({ hasBookings: true });
    }

    const hasBookings = (count ?? 0) > 0;

    console.log(`[LIFF Has Bookings] LINE user ${lineUserId} (profile: ${profile.id}, customer: ${profile.customer_id}) has ${count} bookings (hasBookings: ${hasBookings})`);

    return NextResponse.json({ hasBookings });
  } catch (error) {
    console.error('[LIFF Has Bookings] Unexpected error:', error);
    // On error, assume has bookings to avoid showing promotion incorrectly
    return NextResponse.json({ hasBookings: true });
  }
}
