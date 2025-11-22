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
        <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-700">
            <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Campaign Completed</h3>
          <p className="text-sm text-zinc-400">
            All prizes have been claimed. Stay tuned for the next season!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto mb-8 relative group">
      {/* Glow effect behind the card */}
      {hasDraws && (
        <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-amber-400 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
      )}
      
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 text-center overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-zinc-800 via-red-500 to-zinc-800 opacity-50"></div>

        {/* Draws Count */}
        <div className="mb-6 relative z-10">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
            Your Balance
          </p>
          <div className="flex items-center justify-center gap-3">
             <span className={`text-6xl font-black tracking-tighter ${hasDraws ? 'text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-400 drop-shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'text-zinc-700'}`}>
               {drawsAvailable}
             </span>
             <div className="text-left">
               <span className={`block text-sm font-bold ${hasDraws ? 'text-red-500' : 'text-zinc-600'}`}>SPINS</span>
               <span className="block text-[10px] text-zinc-500">AVAILABLE</span>
             </div>
          </div>
        </div>

        {/* Spin Button */}
        {hasDraws ? (
          <button
            onClick={onSpinClick}
            className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white px-6 py-4 rounded-xl font-bold text-lg uppercase tracking-wider shadow-lg shadow-red-900/40 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Spin the Wheel
          </button>
        ) : (
          <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800 border-dashed">
            <p className="text-sm text-zinc-400 font-medium mb-1">Insufficient Credits</p>
            <p className="text-xs text-zinc-600">
              Earn 1 spin for every 500 THB spent at LENGOLF
            </p>
          </div>
        )}
      </div>
    </div>
  );
}