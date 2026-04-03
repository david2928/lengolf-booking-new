import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

const CLUB_NAMES: Record<number, string> = {
  1: 'Driver', 2: '3-Wood', 3: '5-Wood', 4: 'Hybrid', 5: '5-Iron',
  6: '6-Iron', 7: '7-Iron', 8: '8-Iron', 9: '9-Iron', 10: 'PW',
  11: 'SW', 12: 'Iron', 13: 'Putter',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (supabase as any).schema('simulator');

    // Get the range session
    const { data: session, error: sessionErr } = await sim
      .from('range_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get the individual shots from raw_sensor_shots for this session's file + sequence range
    const { data: shots, error: shotsErr } = await sim
      .from('raw_sensor_shots')
      .select('shot_sequence, velocity, club_velocity, pitch, yaw, sidespin, backspin, club_code, hand')
      .eq('bay_number', session.bay_number)
      .eq('source_file', session.source_file)
      .gte('shot_sequence', session.shot_range_start)
      .lte('shot_sequence', session.shot_range_end)
      .order('shot_sequence', { ascending: true });

    if (shotsErr) {
      console.error('[Range Detail] Shots query error:', shotsErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Club-specific average velocities for carry distance estimation
    const CLUB_CARRY_YARDS: Record<number, number> = {
      1: 220, 2: 200, 3: 185, 4: 175, 5: 160, 6: 150, 7: 140,
      8: 130, 9: 120, 10: 110, 11: 90, 12: 80, 13: 0,
    };
    const CLUB_AVG_VELOCITY: Record<number, number> = {
      1: 167, 2: 196, 3: 172, 4: 166, 5: 160, 6: 157, 7: 153,
      8: 146, 9: 146, 10: 140, 11: 133, 12: 71, 13: 22,
    };

    const formattedShots = (shots ?? []).map((s: {
      shot_sequence: number; velocity: number; club_velocity: number;
      pitch: number; yaw: number; sidespin: number; backspin: number;
      club_code: number; hand: number;
    }, idx: number) => {
      const baseYards = CLUB_CARRY_YARDS[s.club_code] ?? 100;
      const avgVel = CLUB_AVG_VELOCITY[s.club_code] ?? 100;
      const ratio = avgVel > 0 ? Math.max(0.5, Math.min(1.5, s.velocity / avgVel)) : 1;
      const carryYards = s.club_code === 13 ? 0 : Math.round(baseYards * ratio);

      return {
        number: idx + 1,
        club: CLUB_NAMES[s.club_code] ?? `Club ${s.club_code}`,
        clubCode: s.club_code,
        carryYards,
        ballSpeed: Math.round(s.velocity * 0.36 * 10) / 10, // convert to m/s for display
        launchAngle: Math.round(s.pitch * 10) / 10,
        backspin: Math.round(s.backspin),
        sidespin: Math.round(s.sidespin),
      };
    });

    return NextResponse.json({
      session: {
        date: session.session_date,
        bayNumber: session.bay_number,
        startTime: session.started_at
          ? new Date(session.started_at).toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Bangkok',
            })
          : null,
        endTime: session.ended_at
          ? new Date(session.ended_at).toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Bangkok',
            })
          : null,
        totalShots: session.total_shots,
      },
      shots: formattedShots,
    });
  } catch (error) {
    console.error('[Range Detail] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
