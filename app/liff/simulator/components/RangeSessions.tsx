'use client';

import { useState, useEffect } from 'react';

interface Club {
  code: number;
  name: string;
  count: number;
  avgCarryYards: number;
}

interface Session {
  id: string;
  date: string;
  bayNumber: number | null;
  startTime: string | null;
  endTime: string | null;
  totalShots: number | null;
  avgCarryYards: number | null;
  primaryClub: string | null;
  clubs: Club[];
}

interface RangeData {
  summary: {
    totalBalls: number;
    totalSessions: number;
    avgCarryYards: number;
  };
  sessions: Session[];
}

interface Shot {
  number: number;
  club: string;
  clubCode: number;
  carryYards: number;
  ballSpeed: number;
  launchAngle: number;
  backspin: number;
  sidespin: number;
}

interface RangeSessionsProps {
  rangeData: RangeData;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ShotDetailView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [sessionInfo, setSessionInfo] = useState<{ date: string; bayNumber: number; startTime: string; endTime: string; totalShots: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchShots = async () => {
      try {
        const res = await fetch(`/api/liff/simulator/range/${sessionId}`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setSessionInfo(data.session);
        setShots(data.shots);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchShots();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <button onClick={onBack} className="text-sm text-[#005a32] font-medium">&larr; Back to Sessions</button>
        <div className="animate-pulse space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-200 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm text-[#005a32] font-medium">&larr; Back to Sessions</button>

      {sessionInfo && (
        <div className="bg-[#005a32] rounded-xl p-4 text-white">
          <h3 className="font-bold text-base">Range Session</h3>
          <div className="flex items-center gap-3 text-sm text-green-100 mt-1">
            <span>{sessionInfo.date}</span>
            {/* bay info hidden from customers */}
            {sessionInfo.startTime && <span>&middot; {sessionInfo.startTime} – {sessionInfo.endTime}</span>}
          </div>
          <div className="text-sm text-green-100 mt-1">{sessionInfo.totalShots} shots</div>
        </div>
      )}

      {/* Shot table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2 text-left font-medium text-gray-500">#</th>
              <th className="px-2 py-2 text-left font-medium text-gray-500">Club</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Carry</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Speed</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Launch</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500">Spin</th>
            </tr>
          </thead>
          <tbody>
            {shots.map((shot) => (
              <tr key={shot.number} className="border-b border-gray-50">
                <td className="px-2 py-1.5 text-gray-400">{shot.number}</td>
                <td className="px-2 py-1.5 font-medium text-gray-700">{shot.club}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-[#005a32]">
                  {shot.carryYards > 0 ? `${shot.carryYards}y` : '–'}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-600">
                  {shot.ballSpeed > 0 ? `${shot.ballSpeed}` : '–'}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-600">
                  {shot.launchAngle > 0 ? `${shot.launchAngle}°` : '–'}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-600">
                  {shot.backspin > 0 ? shot.backspin.toLocaleString() : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RangeSessions({ rangeData }: RangeSessionsProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { summary, sessions } = rangeData;

  if (selectedSessionId) {
    return <ShotDetailView sessionId={selectedSessionId} onBack={() => setSelectedSessionId(null)} />;
  }

  const summaryCards = [
    { value: summary.totalBalls.toLocaleString(), label: 'Total Balls' },
    { value: summary.totalSessions, label: 'Sessions' },
    { value: summary.avgCarryYards ? `${summary.avgCarryYards}` : '-', label: 'Avg Distance (yds)' },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="bg-[#f0fdf4] rounded-xl p-3 text-center"
          >
            <div className="text-xl font-bold text-[#005a32]">{card.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Sessions */}
      {sessions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Sessions</h3>
          <div className="space-y-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
                className="w-full bg-white rounded-lg p-3 shadow-sm text-left active:bg-gray-50 transition-colors"
              >
                <div className="text-xs text-gray-400">
                  {formatDate(session.date)}
                  {/* bay info hidden from customers */}
                  {session.startTime && session.endTime && (
                    <> &middot; {session.startTime} – {session.endTime}</>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-sm">
                  {session.totalShots != null && (
                    <span className="text-gray-700">
                      <span className="font-semibold">{session.totalShots}</span> balls
                    </span>
                  )}
                  {session.avgCarryYards != null && (
                    <span className="text-gray-700">
                      avg <span className="font-semibold">{Math.round(session.avgCarryYards)}</span>y
                    </span>
                  )}
                  {session.primaryClub && (
                    <span className="text-gray-500">{session.primaryClub}</span>
                  )}
                </div>
                {session.clubs.length > 0 && (
                  <div className="text-xs text-gray-400 mt-1.5 truncate">
                    {session.clubs.map((c, i) => (
                      <span key={c.code}>
                        {i > 0 && ', '}
                        {c.name} &times;{c.count} avg {c.avgCarryYards}y
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-[#005a32] mt-1">Tap for shot details →</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No range sessions found</p>
      )}
    </div>
  );
}
