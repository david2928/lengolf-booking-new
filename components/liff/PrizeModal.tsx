'use client';

import { useEffect, useState } from 'react';

interface PrizeModalProps {
  isOpen: boolean;
  prize: string;
  prizeDescription: string;
  redemptionCode: string;
  imageUrl?: string;
  onClose: () => void;
}

export default function PrizeModal({
  isOpen,
  prize,
  prizeDescription,
  redemptionCode,
  imageUrl,
  onClose
}: PrizeModalProps) {
  const isWinner = prize !== 'Better Luck Next Time';
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isOpen && isWinner) {
      setShowConfetti(true);
      // Stop confetti after 3 seconds
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isWinner]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white animate-in fade-in zoom-in duration-300">
      {/* Confetti Animation */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10px',
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            >
              <div
                className="w-3 h-3 rotate-45"
                style={{
                  backgroundColor: ['#22c55e', '#16a34a', '#f59e0b', '#fbbf24', '#d97706'][Math.floor(Math.random() * 5)],
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Large Prize Image */}
      <div className={`flex-1 flex flex-col items-center justify-center p-6 ${isWinner ? 'bg-gradient-to-b from-green-50 via-amber-50 to-white' : 'bg-gray-50'}`}>
        {/* Winner Badge */}
        <div className={`mb-4 px-5 py-1.5 rounded-full text-base font-black uppercase tracking-wider ${isWinner ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
          {isWinner ? 'You Won!' : 'Better Luck Next Time'}
        </div>

        {/* Prize Image */}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={prize}
            className="max-w-full max-h-full object-contain drop-shadow-xl"
            style={{ maxHeight: '25vh' }}
          />
        ) : (
          <div className={`w-32 h-32 rounded-full flex items-center justify-center border-4 ${isWinner ? 'bg-amber-100 border-amber-300' : 'bg-gray-200 border-gray-300'}`}>
            {isWinner ? (
              <svg className="w-16 h-16 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
            ) : (
              <span className="text-5xl">😢</span>
            )}
          </div>
        )}

        {/* Prize Name & Description */}
        <h2 className={`mt-4 text-xl font-bold text-center ${isWinner ? 'text-gray-900' : 'text-gray-500'}`}>
          {prize}
        </h2>
        {prizeDescription && (
          <p className="mt-1 text-xs text-gray-500 text-center">
            {prizeDescription}
          </p>
        )}
      </div>

      {/* Bottom Section */}
      <div className="bg-white border-t border-gray-200 p-4 pb-safe">
        {isWinner && (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-center">
              <p className="text-[10px] text-amber-600 uppercase tracking-wide mb-1">Redemption Code</p>
              <p className="text-2xl font-mono font-bold text-amber-700 tracking-wider select-all">
                {redemptionCode}
              </p>
            </div>

            {/* Clear Redemption Instructions */}
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-3 mb-3 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-bold text-green-800 uppercase">How to Redeem</p>
              </div>
              <p className="text-xs text-green-700 font-medium">
                Show this screen to LENGOLF staff at the counter to collect your prize
              </p>
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-base shadow-lg transition-colors"
        >
          {isWinner ? 'Collect & Close' : 'Try Again'}
        </button>

        <p className="text-[10px] text-gray-400 mt-3 text-center">
          Valid for 30 days • Mercury Ville @ Chidlom
        </p>
      </div>

      {/* Confetti CSS Animation */}
      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti-fall linear forwards;
        }
      `}</style>
    </div>
  );
}