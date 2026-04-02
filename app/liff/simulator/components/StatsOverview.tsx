interface StatsData {
  totalRounds: number;
  avgStrokesPerHole: number;
  fairwayPct: number;
  totalRangeBalls: number;
}

interface RecentRound {
  id: string;
  course: string;
  date: string;
  holesPlayed: number;
  isComplete: boolean;
  players: string[];
  totalStrokes: number;
}

interface StatsOverviewProps {
  stats: StatsData;
  recentRounds: RecentRound[];
  onSelectRound: (roundId: string) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function StatsOverview({ stats, recentRounds, onSelectRound }: StatsOverviewProps) {
  const statCards = [
    { value: stats.totalRounds, label: 'Rounds Played' },
    { value: stats.avgStrokesPerHole, label: 'Avg Strokes/Hole' },
    { value: `${stats.fairwayPct}%`, label: 'Fairway %' },
    { value: stats.totalRangeBalls.toLocaleString(), label: 'Range Balls' },
  ];

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-[#f0fdf4] rounded-xl p-4 text-center"
          >
            <div className="text-2xl font-bold text-[#005a32]">{card.value}</div>
            <div className="text-xs text-gray-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Rounds */}
      {recentRounds.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Rounds</h3>
          <div className="space-y-2">
            {recentRounds.map((round) => (
              <button
                key={round.id}
                onClick={() => onSelectRound(round.id)}
                className="w-full bg-white rounded-lg p-3 text-left shadow-sm active:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-900 truncate mr-2">
                    {round.course}
                  </span>
                  <span className="text-sm font-bold text-[#005a32] shrink-0">
                    {round.totalStrokes}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatDate(round.date)} &middot; {round.holesPlayed} holes
                  {round.players.length > 0 && (
                    <> &middot; {round.players.join(', ')}</>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
