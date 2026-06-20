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
  const phone = request.nextUrl.searchParams.get('phone');
  const supabase = createAdminClient();

  // Resolve the authenticated caller. Two supported auth modes:
  //   - LIFF: the `x-line-user-id` header (the same trust model
  //     /api/bookings/create uses for the LIFF flow), resolved to a profile
  //     via provider/provider_id. LIFF users authenticate through the LINE
  //     SDK and never carry a NextAuth session cookie, so the session-only
  //     gate this endpoint previously had returned hasBookings:false for
  //     every LIFF caller — which the cost preview reads as isNewCustomer=true,
  //     showing B1G1 to returning customers. Accepting the header here is what
  //     makes the phone-aware check actually work inside LIFF.
  //   - Web: the NextAuth session cookie.
  //
  // Requiring one of these keeps the ?phone= path from being an anonymous
  // phone-enumeration oracle on customer existence. We resolve the LINE header
  // to an EXISTING profile rather than trusting the raw header value, so a
  // scraper can't forge a LINE id to enumerate phones — only app-known LINE
  // identities (i.e. customers who have used the system before) and logged-in
  // web sessions can ask.
  const lineUserId = request.headers.get('x-line-user-id');
  let profileId: string | null = null;
  let customerId: string | null = null;
  let authenticated = false;

  if (lineUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();
    if (profile) {
      authenticated = true;
      profileId = profile.id;
      customerId = profile.customer_id ?? null;
    }
  } else {
    const session = await getServerSession(authOptions) as HasBookingsSession | null;
    if (session?.user?.id) {
      authenticated = true;
      profileId = session.user.id;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('customer_id')
        .eq('id', profileId)
        .maybeSingle();
      customerId = profileData?.customer_id ?? null;
    }
  }

  if (!authenticated) {
    return NextResponse.json({ hasBookings: false });
  }

  // Phone-based path uses the canonical predicate (public.is_phone_new_customer)
  // that the check_new_customer trigger uses to set bookings.is_new_customer
  // at insert time — single source of truth.
  if (phone) {
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

  try {

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