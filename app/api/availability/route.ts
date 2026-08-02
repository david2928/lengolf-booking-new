import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createServerClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyLineIdToken } from '@/lib/auth/line-id-token';
import { getOpeningHour } from '@/lib/opening-hours';

const BOOKING_ID_PATTERN = /^BK\d{6}[A-Za-z0-9]{4}$/;

/**
 * May this caller ask for a booking to be ignored when computing availability?
 *
 * Only its owner. The exclusion is a genuine information leak in the wrong
 * hands: diffing the response with and without an id reveals which bay and slot
 * that booking occupies, and booking ids are short enough to guess at. Ownership
 * is therefore proven, not asserted — a verified LINE token or a NextAuth
 * session, matched against the booking's `user_id` / `customer_id`.
 *
 * Returns false rather than throwing on every failure path, so the route falls
 * back to the ordinary public answer instead of erroring. An edit UI that loses
 * the exclusion shows one slot too few; the modify endpoint is still the
 * authority on whether the move is allowed.
 */
async function ownsBooking(request: NextRequest, bookingId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from('bookings')
    .select('user_id, customer_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) return false;

  const verifiedLineUserId = await verifyLineIdToken(request.headers.get('x-line-id-token'));
  if (verifiedLineUserId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', verifiedLineUserId)
      .maybeSingle();

    if (!profile) return false;
    return (
      booking.user_id === profile.id ||
      Boolean(profile.customer_id && booking.customer_id === profile.customer_id)
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return false;
  if (booking.user_id === session.user.id) return true;

  const { data: profile } = await admin
    .from('profiles')
    .select('customer_id')
    .eq('id', session.user.id)
    .maybeSingle();

  return Boolean(profile?.customer_id && booking.customer_id === profile.customer_id);
}

/**
 * Bay availability. **Deliberately public.**
 *
 * This route used to require a NextAuth token OR an `x-line-user-id` header.
 * That header is client-supplied and never validated, so ANY non-empty string
 * satisfied it — the endpoint was already anonymously reachable by anyone who
 * knew to send one. Removing the check therefore moves no confidentiality
 * boundary; it just stops pretending. The booking UI renders this same data to
 * every visitor, and the response contains no personal data: slot times, bay
 * counts and per-duration availability only.
 *
 * What genuinely changes is VOLUME. Officially anonymous means crawlers and
 * bots, and every request is an uncached service-role RPC against production.
 * The mitigation is therefore a Vercel WAF rate-limit rule, configured in the
 * dashboard — see the note on the response below for why HTTP caching is not
 * available to this route as it stands.
 *
 * Application-level limiting would be the wrong tool: `lib/cache.ts` NodeCache
 * is per-lambda-instance, so a counter in it enforces neither a global nor a
 * stable limit.
 *
 * `/api/availability/check` is a different matter and stays gated.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Parse incoming JSON with error handling
    let body;
    try {
      const text = await request.text();
      if (!text || text.trim() === '') {
        console.warn('Empty request body received');
        return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
      }

      body = JSON.parse(text);
    } catch (error) {
      console.error('JSON parsing error:', error);
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const { date, currentTimeInBangkok, excludeBookingId } = body;
    if (!date || !currentTimeInBangkok) {
      return NextResponse.json({ error: 'Missing required parameters: date and currentTimeInBangkok' }, { status: 400 });
    }

    // An edit flow asks us to ignore the booking being edited, so the customer
    // is not shown their own slot as occupied. Honoured only for its owner (see
    // `ownsBooking`); anyone else silently gets the ordinary public answer.
    let honouredExclusion: string | null = null;
    if (typeof excludeBookingId === 'string' && BOOKING_ID_PATTERN.test(excludeBookingId)) {
      if (await ownsBooking(request, excludeBookingId)) {
        honouredExclusion = excludeBookingId;
      } else {
        console.warn('[Availability] exclusion requested for a booking the caller does not own');
      }
    }

    // 2. Use native database function to fetch availability. v3 adds half-hour
    //    DURATIONS (v2 already had half-hour start times) and rounds the
    //    same-day lead time up to the next half hour, so at 14:10 the 14:30
    //    slot is offered rather than discarded. `maxHours` and the
    //    `bayAvailabilityByDuration` keys are therefore fractional: '1.5',
    //    '2.5'. v2 still exists and is unreferenced; see the migration.
    //
    //    v4 is v3 plus `p_exclude_booking_id`, and is only reached when an
    //    exclusion was requested AND proven. The public path still calls v3
    //    byte-for-byte, so the busiest route in the app is untouched by the edit
    //    feature. (v4 with a null exclusion returns identical output; keeping the
    //    branch means a defect in v4 cannot reach anonymous traffic at all.)
    const supabase = createServerClient();

    const { data: slots, error } = honouredExclusion
      ? await supabase.rpc('get_available_slots_with_max_hours_v4', {
          p_date: date,
          p_current_time_bangkok: currentTimeInBangkok,
          p_start_hour: getOpeningHour(date),
          p_end_hour: 23,
          p_exclude_booking_id: honouredExclusion,
        })
      : await supabase.rpc('get_available_slots_with_max_hours_v3', {
          p_date: date,
          p_current_time_bangkok: currentTimeInBangkok,
          p_start_hour: getOpeningHour(date),
          p_end_hour: 23
        });

    if (error) {
      console.error('Database function error:', error);
      return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
    }

    // NOT cached, and deliberately so — a `Cache-Control` here would be
    // theatre. Two independent reasons:
    //
    //  1. This is a POST. Vercel's edge network caches GET and HEAD only, so
    //     the header would be inert whatever it said.
    //  2. Even as a GET it would never hit. `currentTimeInBangkok` arrives from
    //     the client at millisecond precision, so every request carries a
    //     distinct cache key.
    //
    // Making this genuinely cacheable means moving to GET *and* deriving the
    // current time server-side (which would also stop a client claiming an
    // arbitrary "now" to reveal past slots or dodge same-day lead time). That
    // is a real improvement and a separate change with three callers to
    // migrate. Until then, burst protection is the Vercel WAF rule, not this.
    return NextResponse.json({ slots: slots || [] });
  } catch (error) {
    console.error('Availability API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 