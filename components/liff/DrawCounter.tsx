'use client';

interface DrawCounterProps {
  drawsAvailable: number;
  onSpinClick: () => void;
  campaignActive?: boolean;
}

export default function DrawCounter({ drawsAvailable, onSpinClick, campaignActive = true }: DrawCounterProps) {
  const hasDraws = drawsAvailable > 0;

  // Campaign ended
  if (!campaignActive) {
    return (
      <div className="w-full max-w-md mx-auto mb-8">
        <div className="bg-gradient-to-br from-gray-400 to-gray-500 rounded-2xl shadow-lg p-6 text-white text-center">
          <div className="mb-4">
            <div className="text-5xl mb-3">🎊</div>
            <h3 className="text-xl font-bold mb-2">Campaign Completed!</h3>
            <p className="text-sm opacity-90">
              All prizes have been claimed.
            </p>
            <p className="text-xs opacity-75 mt-2">
              Thank you for participating!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto mb-8">
      <div className={`bg-gradient-to-br ${hasDraws ? 'from-[#005a32] to-[#007a43]' : 'from-gray-400 to-gray-500'} rounded-2xl shadow-lg p-6 text-white text-center`}>
        {/* Draws Count */}
        <div className="mb-4">
          <p className="text-sm font-medium opacity-90 mb-2">You have</p>
          <div className="relative inline-block">
            <div className={`text-6xl font-bold ${hasDraws ? 'animate-pulse' : ''}`}>
              {drawsAvailable}
            </div>
            {hasDraws && (
              <div className="absolute -top-2 -right-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                </span>
              </div>
            )}
          </div>
          <p className="text-lg font-medium mt-2">
            {drawsAvailable === 1 ? 'draw' : 'draws'} available!
          </p>
        </div>

        {/* Spin Button or Message */}
        {hasDraws ? (
          <button
            onClick={onSpinClick}
            className="w-full bg-white text-[#005a32] px-6 py-3 rounded-lg font-bold text-lg hover:bg-gray-50 transition-all transform hover:scale-105 shadow-md flex items-center justify-center gap-2"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            🎰 Spin Now
          </button>
        ) : (
          <div className="text-center py-2">
            <p className="text-sm opacity-90">No draws available</p>
            <p className="text-xs opacity-75 mt-1">
              Complete transactions over 500 THB to earn draws!
            </p>
          </div>
        )}
      </div>

      {/* Helper Text */}
      {hasDraws && (
        <p className="text-center text-sm text-gray-500 mt-3">
          Each draw gives you one spin to win prizes! 🎁
        </p>
      )}
    </div>
  );
}
