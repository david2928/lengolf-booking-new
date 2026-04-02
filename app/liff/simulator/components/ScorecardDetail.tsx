'use client';

import { useEffect, useState } from 'react';

interface HoleScore {
  hole: number;
  strokes: number;
  putts: number | null;
  fairwayHit: boolean | null;
  isHoled: boolean | null;
  penalties: number;
}

interface RoundDetail {
  round: {
    course: string;
    date: string;
    holesPlayed: number;
    isComplete: boolean;
    players: string[];
    startedAt: string | null;
    endedAt: string | null;
  };
  scores: Record<string, HoleScore[]>;
}

interface ScorecardDetailProps {
  roundId: string;
  onBack: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt || !endedAt) return null;
  const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

export default function ScorecardDetail({ roundId, onBack }: ScorecardDetailProps) {
  const [data, setData] = useState<RoundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/liff/simulator/rounds/${roundId}`);
        if (!res.ok) {
          throw new Error('Failed to load round details');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [roundId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <button onClick={onBack} className="text-sm text-[#005a32] font-medium">
          &larr; Back to Rounds
        </button>
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-gray-200 rounded-xl" />
          <div className="h-40 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <button onClick={onBack} className="text-sm text-[#005a32] font-medium">
          &larr; Back to Rounds
        </button>
        <p className="text-sm text-red-500 text-center py-6">{error || 'Round not found'}</p>
      </div>
    );
  }

  const { round, scores } = data;
  const duration = formatDuration(round.startedAt, round.endedAt);
  const playerNames = Object.keys(scores);

  // Split holes into front 9 and back 9
  const frontHoles = Array.from({ length: 9 }, (_, i) => i + 1);
  const backHoles = round.holesPlayed > 9
    ? Array.from({ length: Math.min(9, round.holesPlayed - 9) }, (_, i) => i + 10)
    : [];

  // Calculate player summaries
  const playerSummaries = playerNames.map(name => {
    const playerScores = scores[name];
    const totalStrokes = playerScores.reduce((sum, s) => sum + s.strokes, 0);
    const fairwayHits = playerScores.filter(s => s.fairwayHit != null);
    const fairwayPct = fairwayHits.length > 0
      ? Math.round((fairwayHits.filter(s => s.fairwayHit).length / fairwayHits.length) * 100)
      : null;
    const totalPutts = playerScores.reduce((sum, s) => sum + (s.putts ?? 0), 0);
    const totalPenalties = playerScores.reduce((sum, s) => sum + s.penalties, 0);
    return { name, totalStrokes, fairwayPct, totalPutts, totalPenalties };
  });

  const renderHoleGrid = (holes: number[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#005a32] text-white">
            <th className="px-2 py-1.5 text-left font-medium">Hole</th>
            {holes.map(h => (
              <th key={h} className="px-2 py-1.5 text-center font-medium min-w-[28px]">{h}</th>
            ))}
            <th className="px-2 py-1.5 text-center font-medium">Tot</th>
          </tr>
        </thead>
        <tbody>
          {playerNames.map(name => {
            const playerScores = scores[name];
            const holeMap = new Map(playerScores.map(s => [s.hole, s]));
            const subtotal = holes.reduce((sum, h) => {
              const s = holeMap.get(h);
              return sum + (s ? s.strokes : 0);
            }, 0);

            return (
              <tr key={name} className="border-b border-gray-100">
                <td className="px-2 py-1.5 font-medium text-gray-700 truncate max-w-[60px]">
                  {name}
                </td>
                {holes.map(h => {
                  const score = holeMap.get(h);
                  {/* TODO: Color-code cells when par data is available (birdie=green, bogey=red, etc.) */}
                  return (
                    <td key={h} className="px-2 py-1.5 text-center text-gray-900">
                      {score ? score.strokes : '-'}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center font-bold text-[#005a32]">
                  {subtotal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Back button */}
      <button onClick={onBack} className="text-sm text-[#005a32] font-medium">
        &larr; Back to Rounds
      </button>

      {/* Header card */}
      <div className="bg-[#005a32] rounded-xl p-4 text-white">
        <h3 className="font-bold text-base">{round.course}</h3>
        <div className="flex items-center gap-3 text-sm text-green-100 mt-1">
          <span>{formatDate(round.date)}</span>
          <span>&middot; {round.holesPlayed} holes</span>
          {duration && <span>&middot; {duration}</span>}
        </div>
      </div>

      {/* Scorecard grids */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {renderHoleGrid(frontHoles)}
        {backHoles.length > 0 && (
          <>
            <div className="border-t border-gray-200" />
            {renderHoleGrid(backHoles)}
          </>
        )}
      </div>

      {/* Summary bar */}
      {playerSummaries.map(ps => (
        <div key={ps.name} className="bg-white rounded-xl shadow-sm p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">{ps.name}</p>
          <div className="flex justify-between text-center">
            <div>
              <div className="text-lg font-bold text-[#005a32]">{ps.totalStrokes}</div>
              <div className="text-[10px] text-gray-400">Total Strokes</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#005a32]">
                {ps.fairwayPct != null ? `${ps.fairwayPct}%` : '-'}
              </div>
              <div className="text-[10px] text-gray-400">Fairway %</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#005a32]">{ps.totalPutts}</div>
              <div className="text-[10px] text-gray-400">Putts</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#005a32]">{ps.totalPenalties}</div>
              <div className="text-[10px] text-gray-400">Penalties</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
