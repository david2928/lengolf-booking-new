import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { getOpeningHour } from '@/lib/opening-hours';

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

    const { date, currentTimeInBangkok } = body;
    if (!date || !currentTimeInBangkok) {
      return NextResponse.json({ error: 'Missing required parameters: date and currentTimeInBangkok' }, { status: 400 });
    }

    // 2. Use native database function to fetch availability. v3 adds half-hour
    //    DURATIONS (v2 already had half-hour start times) and rounds the
    //    same-day lead time up to the next half hour, so at 14:10 the 14:30
    //    slot is offered rather than discarded. `maxHours` and the
    //    `bayAvailabilityByDuration` keys are therefore fractional: '1.5',
    //    '2.5'. v2 still exists and is unreferenced; see the migration.
    const supabase = createServerClient();

    const { data: slots, error } = await supabase.rpc('get_available_slots_with_max_hours_v3', {
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