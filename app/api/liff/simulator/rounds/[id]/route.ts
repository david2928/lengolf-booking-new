import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Round ID is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (supabase as any).schema('simulator');

    // Fetch round and scores in parallel
    const [roundResult, scoresResult] = await Promise.all([
      sim
        .from('simulator_rounds')
        .select('id, course_name, round_date, holes_played, is_complete, player_names, started_at, ended_at')
        .eq('id', id)
        .single(),
      sim
        .from('simulator_round_scores')
        .select('player_name, hole_number, strokes, putts, fairway_hit, is_holed, penalties')
        .eq('round_id', id)
        .order('hole_number', { ascending: true }),
    ]);

    if (roundResult.error) {
      if (roundResult.error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Round not found' }, { status: 404 });
      }
      console.error('[Simulator Round Detail] Round query error:', roundResult.error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (scoresResult.error) {
      console.error('[Simulator Round Detail] Scores query error:', scoresResult.error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const round = roundResult.data as {
      id: string;
      course_name: string;
      round_date: string;
      holes_played: number;
      is_complete: boolean;
      player_names: string[];
      started_at: string | null;
      ended_at: string | null;
    };

    const scoreRows = (scoresResult.data || []) as {
      player_name: string;
      hole_number: number;
      strokes: number;
      putts: number | null;
      fairway_hit: boolean | null;
      is_holed: boolean | null;
      penalties: number | null;
    }[];

    // Group scores by player_name
    const scores: Record<string, {
      hole: number;
      strokes: number;
      putts: number | null;
      fairwayHit: boolean | null;
      isHoled: boolean | null;
      penalties: number;
    }[]> = {};

    for (const row of scoreRows) {
      if (!scores[row.player_name]) {
        scores[row.player_name] = [];
      }
      scores[row.player_name].push({
        hole: row.hole_number,
        strokes: row.strokes,
        putts: row.putts,
        fairwayHit: row.fairway_hit,
        isHoled: row.is_holed,
        penalties: row.penalties ?? 0,
      });
    }

    return NextResponse.json({
      round: {
        course: round.course_name,
        date: round.round_date,
        holesPlayed: round.holes_played,
        isComplete: round.is_complete,
        players: round.player_names || [],
        startedAt: round.started_at,
        endedAt: round.ended_at,
      },
      scores,
    });
  } catch (error) {
    console.error('[Simulator Round Detail] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
