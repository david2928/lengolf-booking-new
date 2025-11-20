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
        <div className="bg-white border-2 border-gray-300 rounded-xl shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Campaign Completed</h3>
          <p className="text-sm text-gray-600">
            All prizes have been claimed. Thank you for participating!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto mb-8">
      <div className={`${hasDraws ? 'bg-[#005a32]' : 'bg-white border-2 border-gray-300'} rounded-xl shadow-sm p-8 text-center`}>
        {/* Draws Count */}
        <div className="mb-6">
          <p className={`text-sm font-medium ${hasDraws ? 'text-white/80' : 'text-gray-600'} mb-3`}>
            Available Draws
          </p>
          <div className="relative inline-block">
            <div className={`text-7xl font-bold ${hasDraws ? 'text-white' : 'text-gray-400'}`}>
              {drawsAvailable}
            </div>
          </div>
        </div>

        {/* Spin Button or Message */}
        {hasDraws ? (
          <button
            onClick={onSpinClick}
            className="w-full bg-white text-[#005a32] px-6 py-4 rounded-lg font-bold text-lg hover:bg-gray-50 transition-all shadow-sm"
          >
            Spin Wheel
          </button>
        ) : (
          <div className="text-center py-2">
            <p className="text-sm text-gray-600 mb-1">No draws available</p>
            <p className="text-xs text-gray-500">
              Earn draws with transactions over 500 THB
            </p>
          </div>
        )}
      </div>

      {/* Helper Text */}
      {hasDraws && (
        <p className="text-center text-xs text-gray-500 mt-3">
          Use your draws to spin and win prizes
        </p>
      )}
    </div>
  );
}
