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
        <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-2xl p-8 text-center border border-zinc-700 shadow-xl">
          <div className="w-16 h-16 bg-zinc-950 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
            <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Campaign Completed</h3>
          <p className="text-sm text-zinc-400">
            All prizes have been claimed. Thank you for participating!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto mb-8">
      <div className="relative">
        {/* Main Card */}
        <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-2xl p-6 border border-zinc-700 shadow-xl">

          <div className="flex justify-between items-end mb-6">
            <div>
              <h3 className="text-zinc-400 text-xs uppercase tracking-widest font-bold">Available Spins</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-white tracking-tighter">
                  {drawsAvailable}
                </span>
                <span className="text-sm text-zinc-500 font-medium">Credits</span>
              </div>
            </div>

            {/* Decorative Badge */}
            <div className="w-10 h-10 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center">
              <span className="text-green-500 text-xl">⛳</span>
            </div>
          </div>

          {/* The Main Action Button */}
          <button
            onClick={onSpinClick}
            disabled={!hasDraws || !campaignActive}
            className={`
              w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all
              ${hasDraws
                ? 'bg-gradient-to-r from-green-600 to-green-500 text-white shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] hover:-translate-y-0.5'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}
            `}
          >
            {hasDraws ? 'Spin the Wheel' : 'Get More Spins'}
          </button>

          {/* Helper Text */}
          <div className="mt-4 text-center">
            <p className="text-[10px] text-zinc-500">
              1 Spin earned for every 500 THB spent
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
