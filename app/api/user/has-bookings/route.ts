import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createAdminClient } from '@/utils/supabase/admin';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

interface HasBookingsSessionUser extends NextAuthUser {
  id: string;
}

interface HasBookingsSession extends NextAuthSession {
  user: HasBookingsSessionUser;
}

export async function GET() {
  const session = await getServerSession(authOptions) as HasBookingsSession | null;

  // If not authenticated, return false (treat as new customer)
  if (!session?.user?.id) {
    return NextResponse.json({ hasBookings: false });
  }

  const profileId = session.user.id;
  const supabase = createAdminClient();

  try {
    // First get the user's customer_id if they have one
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', profileId)
      .single();

    if (profileError) {
      console.error('[Has Bookings API] Error fetching profile:', profileError);
      // On error, assume user has bookings to avoid showing promotion incorrectly
      return NextResponse.json({ hasBookings: true });
    }

    const customerId = profileData?.customer_id;

    // Check if user has any bookings by user_id OR customer_id
    let query = supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true });

    // Build OR condition: check both user_id and customer_id if customer_id exists
    if (customerId) {
      query = query.or(`user_id.eq.${profileId},customer_id.eq.${customerId}`);
    } else {
      query = query.eq('user_id', profileId);
    }

    const { count, error } = await query;

    if (error) {
      console.error('[Has Bookings API] Error checking bookings:', error);
      // On error, assume user has bookings to avoid showing promotion incorrectly
      return NextResponse.json({ hasBookings: true });
    }

    const hasBookings = (count ?? 0) > 0;

    console.log(`[Has Bookings API] User ${profileId} (customer: ${customerId}) has ${count} bookings (hasBookings: ${hasBookings})`);

    return NextResponse.json({ hasBookings });
  } catch (error) {
    console.error('[Has Bookings API] Unexpected error:', error);
    // On error, assume user has bookings to avoid showing promotion incorrectly
    return NextResponse.json({ hasBookings: true });
  }
}
