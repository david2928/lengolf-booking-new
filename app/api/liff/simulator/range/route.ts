import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

const CLUB_NAMES: Record<number, string> = {
  1: 'Driver', 2: '3-Wood', 3: '5-Wood', 4: 'Hybrid', 5: '5-Iron',
  6: '6-Iron', 7: '7-Iron', 8: '8-Iron', 9: '9-Iron', 10: 'PW',
  11: 'SW', 12: 'Iron', 13: 'Putter',
};

interface ClubUsedRaw {
  club_code: number;
  count: number;
  avg_carry_yards: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineUserId = searchParams.get('lineUserId');
    let customerId = searchParams.get('customerId');

    const supabase = createAdminClient();

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
        console.error('[Simulator Range] Profile query error:', profileError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      if (!profile?.customer_id) {
        return NextResponse.json({ status: 'not_matched' });
      }

      customerId = profile.customer_id as string;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (supabase as any).schema('simulator');

    // Fetch range sessions
    const { data: sessionsData, error: sessionsError } = await sim
      .from('range_sessions')
      .select('id, session_date, bay_number, started_at, ended_at, total_shots, avg_carry_yards, clubs_used')
      .eq('customer_id', customerId)
      .order('session_date', { ascending: false });

    if (sessionsError) {
      console.error('[Simulator Range] Sessions query error:', sessionsError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const sessions = (sessionsData || []) as {
      id: string;
      session_date: string;
      bay_number: number | null;
      started_at: string | null;
      ended_at: string | null;
      total_shots: number | null;
      avg_carry_yards: number | null;
      clubs_used: ClubUsedRaw[] | null;
    }[];

    // Calculate summary
    const totalBalls = sessions.reduce((sum, s) => sum + (s.total_shots || 0), 0);
    const totalSessions = sessions.length;
    const sessionsWithCarry = sessions.filter(s => s.avg_carry_yards != null);
    const avgCarryYards = sessionsWithCarry.length > 0
      ? Math.round(sessionsWithCarry.reduce((sum, s) => sum + s.avg_carry_yards!, 0) / sessionsWithCarry.length)
      : 0;

    // Format sessions
    const formattedSessions = sessions.map(s => {
      const clubs = (s.clubs_used || []).map((club: ClubUsedRaw) => ({
        code: club.club_code,
        name: CLUB_NAMES[club.club_code] || `Club ${club.club_code}`,
        count: club.count,
        avgCarryYards: club.avg_carry_yards,
      }));

      // Determine primary club (most used)
      const primaryClub = clubs.length > 0
        ? clubs.reduce((max, c) => c.count > max.count ? c : max, clubs[0]).name
        : null;

      return {
        id: s.id,
        date: s.session_date,
        bayNumber: s.bay_number,
        startTime: s.started_at
          ? new Date(s.started_at).toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Bangkok',
            })
          : null,
        endTime: s.ended_at
          ? new Date(s.ended_at).toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Bangkok',
            })
          : null,
        totalShots: s.total_shots,
        avgCarryYards: s.avg_carry_yards,
        primaryClub,
        clubs,
      };
    });

    return NextResponse.json({
      summary: {
        totalBalls,
        totalSessions,
        avgCarryYards,
      },
      sessions: formattedSessions,
    });
  } catch (error) {
    console.error('[Simulator Range] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
