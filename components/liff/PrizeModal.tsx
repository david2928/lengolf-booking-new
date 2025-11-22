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

  const handleShare = () => {
    if (typeof window !== 'undefined' && window.liff?.isApiAvailable('shareTargetPicker')) {
      window.liff.shareTargetPicker([
        {
          type: 'text',
          text: `I just won "${prize}" at LENGOLF! ⛳\nGame on! ${window.location.href}`
        }
      ]).catch(console.error);
    }
  };

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
                  backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'][Math.floor(Math.random() * 5)],
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors shadow-md"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Large Prize Image */}
      <div className={`flex-1 flex flex-col items-center justify-center p-8 ${isWinner ? 'bg-gradient-to-b from-green-50 via-amber-50 to-white' : 'bg-gray-50'}`}>
        {/* Winner Badge */}
        <div className={`mb-6 px-6 py-2 rounded-full text-lg font-black uppercase tracking-wider ${isWinner ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
          {isWinner ? '🎉 You Won! 🎉' : 'Better Luck Next Time'}
        </div>

        {/* Prize Image */}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={prize}
            className="max-w-full max-h-full object-contain drop-shadow-xl"
            style={{ maxHeight: '40vh' }}
          />
        ) : (
          <div className={`w-48 h-48 rounded-full flex items-center justify-center border-4 ${isWinner ? 'bg-amber-100 border-amber-300' : 'bg-gray-200 border-gray-300'}`}>
            {isWinner ? (
              <svg className="w-24 h-24 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
            ) : (
              <span className="text-6xl">😢</span>
            )}
          </div>
        )}

        {/* Prize Name */}
        <h2 className={`mt-6 text-2xl font-bold text-center ${isWinner ? 'text-gray-900' : 'text-gray-500'}`}>
          {prize}
        </h2>
      </div>

      {/* Bottom Section */}
      <div className="bg-white border-t border-gray-200 p-6 pb-safe">
        {isWinner && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-center">
            <p className="text-xs text-amber-600 uppercase tracking-wide mb-1">Redemption Code</p>
            <p className="text-3xl font-mono font-bold text-amber-700 tracking-wider select-all">
              {redemptionCode}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {isWinner && (
            <button
              onClick={handleShare}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium border border-gray-200 transition-colors"
            >
              Share with Friends
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg shadow-lg transition-colors"
          >
            {isWinner ? 'Collect & Close' : 'Try Again'}
          </button>
        </div>

        <p className="text-[10px] text-gray-400 mt-4 text-center">
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