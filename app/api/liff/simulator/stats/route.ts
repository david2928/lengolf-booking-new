import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { appCache } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineUserId = searchParams.get('lineUserId');
    let customerId = searchParams.get('customerId');

    const supabase = createAdminClient();
    const cacheKey = `simulator_stats_${customerId || lineUserId}`;

    // Check cache first
    const cachedData = appCache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData, {
        headers: { 'X-Cache': 'HIT' }
      });
    }

    // If customerId is provided directly (demo mode), skip LINE lookup
    if (!customerId) {
      if (!lineUserId) {
        return NextResponse.json(
          { error: 'lineUserId is required' },
          { status: 400 }
        );
      }

      // Look up profile by LINE userId
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, customer_id')
        .eq('provider', 'line')
        .eq('provider_id', lineUserId)
        .maybeSingle();

      if (profileError) {
        console.error('[Simulator Stats] Profile query error:', profileError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      if (!profile?.customer_id) {
        return NextResponse.json({ status: 'not_matched' });
      }

      customerId = profile.customer_id as string;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (supabase as any).schema('simulator');

    // Query all data in parallel
    const [scoresResult, rangeShotsResult] = await Promise.all([
      // Get all scores for this customer
      sim
        .from('simulator_round_scores')
        .select('round_id, strokes, putts, fairway_hit')
        .eq('customer_id', customerId),
      // Get total_shots from range_sessions
      sim
        .from('range_sessions')
        .select('total_shots')
        .eq('customer_id', customerId),
    ]);

    if (scoresResult.error) {
      console.error('[Simulator Stats] Scores query error:', scoresResult.error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (rangeShotsResult.error) {
      console.error('[Simulator Stats] Range query error:', rangeShotsResult.error);
    }

    const allScores = (scoresResult.data || []) as {
      round_id: string;
      strokes: number | null;
      putts: number | null;
      fairway_hit: boolean | null;
    }[];

    // Count distinct rounds
    const distinctRoundIds = [...new Set(allScores.map(s => s.round_id))];
    const totalRounds = distinctRoundIds.length;

    // Calculate avg strokes per hole
    const validStrokes = allScores.filter(s => s.strokes != null);
    const avgStrokesPerHole = validStrokes.length > 0
      ? Math.round((validStrokes.reduce((sum, s) => sum + s.strokes!, 0) / validStrokes.length) * 100) / 100
      : 0;

    // Calculate fairway percentage
    const fairwayScores = allScores.filter(s => s.fairway_hit != null);
    const fairwayPct = fairwayScores.length > 0
      ? Math.round((fairwayScores.filter(s => s.fairway_hit).length / fairwayScores.length) * 1000) / 10
      : 0;

    // Sum total range balls
    const rangeData = (rangeShotsResult.data || []) as { total_shots: number | null }[];
    const totalRangeBalls = rangeData.reduce((sum, r) => sum + (r.total_shots || 0), 0);

    // Get last 3 rounds - fetch round details for the most recent round_ids
    const recentRoundIds = distinctRoundIds.slice(0, 10); // get extra in case we need to filter

    let recentRounds: {
      id: string;
      course: string;
      date: string;
      holesPlayed: number;
      isComplete: boolean;
      players: string[];
      totalStrokes: number;
    }[] = [];

    if (recentRoundIds.length > 0) {
      const { data: roundsData, error: roundsError } = await sim
        .from('simulator_rounds')
        .select('id, course_name, round_date, holes_played, is_complete, player_names')
        .in('id', recentRoundIds)
        .order('round_date', { ascending: false })
        .limit(3);

      if (roundsError) {
        console.error('[Simulator Stats] Rounds query error:', roundsError);
      }

      const rounds = (roundsData || []) as {
        id: string;
        course_name: string;
        round_date: string;
        holes_played: number;
        is_complete: boolean;
        player_names: string[];
      }[];

      recentRounds = rounds.map(round => {
        const roundScores = allScores.filter(s => s.round_id === round.id && s.strokes != null);
        const totalStrokes = roundScores.reduce((sum, s) => sum + s.strokes!, 0);

        return {
          id: round.id,
          course: round.course_name,
          date: round.round_date,
          holesPlayed: round.holes_played,
          isComplete: round.is_complete,
          players: round.player_names || [],
          totalStrokes,
        };
      });
    }

    const responseData = {
      status: 'matched',
      player: { customerId },
      stats: {
        totalRounds,
        avgStrokesPerHole,
        fairwayPct,
        totalRangeBalls,
      },
      recentRounds,
    };

    // Cache for 30 seconds
    appCache.set(cacheKey, responseData, 30);

    return NextResponse.json(responseData, {
      headers: { 'X-Cache': 'MISS' }
    });
  } catch (error) {
    console.error('[Simulator Stats] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
