import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/coaching/availability
 *
 * Public endpoint for fetching coach availability
 * Used by the LIFF Coaching page
 *
 * Query parameters:
 * - days: number of days to fetch (default: 14)
 * - from_date: start date in YYYY-MM-DD format (default: today)
 *
 * Response:
 * {
 *   coaches: [
 *     {
 *       id: string,
 *       name: string,
 *       displayName: string,
 *       availability: [
 *         {
 *           date: string,
 *           dayOfWeek: number,
 *           slots: string[],
 *           isToday: boolean,
 *           scheduleStart: string | null,
 *           scheduleEnd: string | null
 *         }
 *       ]
 *     }
 *   ],
 *   generatedAt: string
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '14', 10);
    const fromDateParam = searchParams.get('from_date');

    // Validate days parameter
    if (isNaN(days) || days < 1 || days > 30) {
      return NextResponse.json(
        { error: 'Invalid days parameter. Must be between 1 and 30.' },
        { status: 400 }
      );
    }

    // Calculate date range
    const fromDate = fromDateParam || new Date().toISOString().split('T')[0];
    const toDateObj = new Date(fromDate);
    toDateObj.setDate(toDateObj.getDate() + days - 1);
    const toDate = toDateObj.toISOString().split('T')[0];

    // Initialize Supabase client
    const supabase = createServerClient();

    // Call the RPC function to get coaching availability
    const { data: availabilityData, error: rpcError } = await supabase.rpc(
      'get_coaching_availability',
      {
        p_from_date: fromDate,
        p_to_date: toDate,
      }
    );

    if (rpcError) {
      console.error('RPC function error:', rpcError);
      return NextResponse.json(
        { error: 'Failed to fetch coach availability' },
        { status: 500 }
      );
    }

    // Group availability by coach
    const coachesMap = new Map<string, {
      id: string;
      name: string;
      displayName: string;
      availability: Array<{
        date: string;
        dayOfWeek: number;
        slots: string[];
        isToday: boolean;
        scheduleStart: string | null;
        scheduleEnd: string | null;
      }>;
    }>();

    const today = new Date().toISOString().split('T')[0];

    if (availabilityData && Array.isArray(availabilityData)) {
      for (const row of availabilityData) {
        const coachId = row.coach_id;

        if (!coachesMap.has(coachId)) {
          coachesMap.set(coachId, {
            id: coachId,
            name: row.coach_name || '',
            displayName: row.coach_display_name || row.coach_name || '',
            availability: [],
          });
        }

        const coach = coachesMap.get(coachId)!;
        coach.availability.push({
          date: row.availability_date,
          dayOfWeek: row.day_of_week,
          slots: row.available_slots || [],
          isToday: row.availability_date === today,
          scheduleStart: row.schedule_start || null,
          scheduleEnd: row.schedule_end || null,
        });
      }
    }

    // Convert map to array
    const coaches = Array.from(coachesMap.values());

    return NextResponse.json({
      coaches,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Coaching availability API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
