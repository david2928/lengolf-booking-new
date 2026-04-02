import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineUserId = searchParams.get('lineUserId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));

    if (!lineUserId) {
      return NextResponse.json(
        { error: 'lineUserId is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Look up profile by LINE userId
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();

    if (profileError) {
      console.error('[Simulator Rounds] Profile query error:', profileError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!profile?.customer_id) {
      return NextResponse.json({ status: 'not_matched' });
    }

    const customerId = profile.customer_id as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (supabase as any).schema('simulator');

    // Get distinct round_ids where this customer has scores
    const { data: scoreRounds, error: scoreRoundsError } = await sim
      .from('simulator_round_scores')
      .select('round_id, strokes')
      .eq('customer_id', customerId);

    if (scoreRoundsError) {
      console.error('[Simulator Rounds] Score rounds query error:', scoreRoundsError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const allScores = (scoreRounds || []) as { round_id: string; strokes: number | null }[];
    const distinctRoundIds = [...new Set(allScores.map(s => s.round_id))];
    const totalCount = distinctRoundIds.length;
    const totalPages = Math.ceil(totalCount / limit);

    if (distinctRoundIds.length === 0) {
      return NextResponse.json({
        rounds: [],
        pagination: { currentPage: page, totalPages: 0, totalCount: 0 },
      });
    }

    // Fetch rounds with pagination (need to fetch all matching rounds, sort, then paginate)
    const { data: roundsData, error: roundsError } = await sim
      .from('simulator_rounds')
      .select('id, course_name, round_date, holes_played, is_complete, player_names')
      .in('id', distinctRoundIds)
      .order('round_date', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (roundsError) {
      console.error('[Simulator Rounds] Rounds query error:', roundsError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const rounds = (roundsData || []) as {
      id: string;
      course_name: string;
      round_date: string;
      holes_played: number;
      is_complete: boolean;
      player_names: string[];
    }[];

    // Calculate total strokes per round for this customer
    const roundsWithStrokes = rounds.map(round => {
      const roundScores = allScores.filter(s => s.round_id === round.id && s.strokes != null);
      const totalStrokes = roundScores.reduce((sum, s) => sum + s.strokes!, 0);

      return {
        id: round.id,
        course_name: round.course_name,
        round_date: round.round_date,
        holes_played: round.holes_played,
        is_complete: round.is_complete,
        players: round.player_names || [],
        totalStrokes,
      };
    });

    return NextResponse.json({
      rounds: roundsWithStrokes,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
      },
    });
  } catch (error) {
    console.error('[Simulator Rounds] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
