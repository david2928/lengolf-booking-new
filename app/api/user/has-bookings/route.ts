import { NextRequest, NextResponse } from 'next/server';
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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions) as HasBookingsSession | null;
  const phone = request.nextUrl.searchParams.get('phone');

  // Both paths require a session. The phone-based path in particular MUST be
  // gated: without auth it would be an enumeration oracle on customer
  // existence (anon could probe arbitrary phone numbers and learn whether
  // each has any prior bookings or POS sales). All legitimate callers
  // (LIFF, NextAuth web flow, guest provider) have a session by the time
  // they reach the cost preview, so requiring one is non-disruptive.
  if (!session?.user?.id) {
    return NextResponse.json({ hasBookings: false });
  }

  // Phone-based path uses the canonical predicate (public.is_phone_new_customer)
  // that the check_new_customer trigger uses to set bookings.is_new_customer
  // at insert time — single source of truth.
  if (phone) {
    const supabase = createAdminClient();
    const { data: profileData } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', session.user.id)
      .maybeSingle();
    const customerId = profileData?.customer_id ?? null;

    const { data: isNew, error } = await supabase.rpc('is_phone_new_customer', {
      p_phone: phone,
      p_customer_id: customerId,
    });

    if (error) {
      console.error('[Has Bookings API] is_phone_new_customer RPC error:', error);
      // On error, assume user has bookings so we don't incorrectly show promos
      return NextResponse.json({ hasBookings: true });
    }

    // RPC returns NULL when phone is unusable and no customer_id signal exists.
    // Default to "treat as new" in that case so we don't block legitimate B1G1
    // for genuine new customers who haven't typed enough yet.
    const hasBookings = isNew === false;
    return NextResponse.json({ hasBookings });
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