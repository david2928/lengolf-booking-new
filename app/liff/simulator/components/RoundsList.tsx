interface Round {
  id: string;
  course_name: string;
  round_date: string;
  holes_played: number;
  is_complete: boolean;
  players: string[];
  totalStrokes: number;
}

interface Pagination {
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

interface RoundsListProps {
  rounds: Round[];
  pagination: Pagination;
  onSelectRound: (roundId: string) => void;
  onPageChange: (page: number) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RoundsList({ rounds, pagination, onSelectRound, onPageChange }: RoundsListProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">
        All Rounds ({pagination.totalCount})
      </h3>

      {rounds.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No rounds found</p>
      )}

      <div className="space-y-2">
        {rounds.map((round) => (
          <button
            key={round.id}
            onClick={() => onSelectRound(round.id)}
            className="w-full bg-white rounded-lg p-3 text-left shadow-sm border-l-[3px] border-[#005a32] active:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-gray-900 truncate mr-2">
                {round.course_name}
              </span>
              <span className="text-sm font-bold text-[#005a32] shrink-0">
                {round.totalStrokes}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-xs text-gray-400">
                {formatDate(round.round_date)} &middot; {round.holes_played} holes
                {round.players.length > 0 && (
                  <> &middot; {round.players.join(', ')}</>
                )}
              </div>
              <span className={`text-xs font-medium ${round.is_complete ? 'text-green-600' : 'text-gray-400'}`}>
                {round.is_complete ? '\u2713 Complete' : 'Abandoned'}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {pagination.totalCount > 0 && (
        <div className="text-center py-2">
          <p className="text-xs text-gray-400 mb-2">
            Showing {rounds.length} of {pagination.totalCount}
          </p>
          {pagination.currentPage < pagination.totalPages && (
            <button
              onClick={() => onPageChange(pagination.currentPage + 1)}
              className="text-sm font-medium text-[#005a32] active:text-green-800"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
