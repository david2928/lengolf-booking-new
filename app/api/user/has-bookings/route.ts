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
  //     /api/bookings/create uses for the LIFF flow). LIFF users authenticate
  //     through the LINE SDK and never carry a NextAuth session cookie, so the
  //     session-only gate this endpoint previously had returned
  //     hasBookings:false for every LIFF caller — which the cost preview reads
  //     as isNewCustomer=true, showing B1G1 to returning customers. Accepting
  //     the header here is what makes the eligibility check work inside LIFF.
  //   - Web: the NextAuth session cookie.
  //
  // Customer resolution for the phone check below:
  //   - If the LINE account is already LINKED to a customer (profile has a
  //     customer_id), we trust that linkage and pass it as the authoritative
  //     signal — no further checks needed.
  //   - If it's NOT linked (first-time / fresh LINE account, no profile or no
  //     customer_id yet), we fall through with customerId=null and let the
  //     entered-phone check decide, so a returning-by-phone customer on a new
  //     LINE account is still correctly identified instead of being shown B1G1.
  //
  // Security note: trusting the raw x-line-user-id header (rather than
  // requiring it to resolve to a known profile) means the ?phone= path is again
  // reachable by anyone who sets the header, i.e. a phone-existence enumeration
  // oracle. This matches the trust model the rest of the LIFF surface already
  // uses for the header. If that exposure ever needs closing without losing the
  // unlinked-phone fallback, verify the LIFF ID/access token server-side here.
  const lineUserId = request.headers.get('x-line-user-id');
  let profileId: string | null = null;
  let customerId: string | null = null;
  let authenticated = false;

  if (lineUserId) {
    const { data: profile, error: profileLookupError } = await supabase
      .from('profiles')
      .select('id, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();
    // A missing profile (first-time LINE account) is data:null/error:null and
    // is fine — we fall through and let the entered-phone check decide. But a
    // real DB error must NOT be swallowed: dropping customer_id here would lose
    // the linkage signal and could show B1G1 to a returning customer. Keep the
    // safe default (treat as returning) on error, as the no-phone path does.
    if (profileLookupError) {
      console.error('[Has Bookings API] LIFF profile lookup error:', profileLookupError);
      return NextResponse.json({ hasBookings: true });
    }
    authenticated = true;
    profileId = profile?.id ?? null;
    customerId = profile?.customer_id ?? null;
  } else {
    const session = await getServerSession(authOptions) as HasBookingsSession | null;
    if (session?.user?.id) {
      authenticated = true;
      profileId = session.user.id;
      const { data: profileData, error: profileLookupError } = await supabase
        .from('profiles')
        .select('customer_id')
        .eq('id', profileId)
        .maybeSingle();
      if (profileLookupError) {
        console.error('[Has Bookings API] Session profile lookup error:', profileLookupError);
        // Safe default: assume returning so we don't show the promo on a DB error.
        return NextResponse.json({ hasBookings: true });
      }
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

  // Legacy profile-based path (non-LIFF web layout's promotion bar, which calls
  // without ?phone=). Requires a resolved profile id; a LIFF caller without a
  // profile only reaches here if it omitted the phone, which it never does.
  if (!profileId) {
    return NextResponse.json({ hasBookings: false });
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