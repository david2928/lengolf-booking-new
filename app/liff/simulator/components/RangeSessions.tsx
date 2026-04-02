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

interface RangeSessionsProps {
  rangeData: RangeData;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RangeSessions({ rangeData }: RangeSessionsProps) {
  const { summary, sessions } = rangeData;

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
              <div
                key={session.id}
                className="bg-white rounded-lg p-3 shadow-sm"
              >
                <div className="text-xs text-gray-400">
                  {formatDate(session.date)}
                  {session.bayNumber && <> &middot; Bay {session.bayNumber}</>}
                  {session.startTime && session.endTime && (
                    <> &middot; {session.startTime} - {session.endTime}</>
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
                      avg <span className="font-semibold">{session.avgCarryYards}</span>y
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
              </div>
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
