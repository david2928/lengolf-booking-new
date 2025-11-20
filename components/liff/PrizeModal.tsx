'use client';

import { useEffect, useState } from 'react';

interface PrizeModalProps {
  isOpen: boolean;
  prize: string;
  prizeDescription: string;
  redemptionCode: string;
  onClose: () => void;
}

export default function PrizeModal({
  isOpen,
  prize,
  prizeDescription,
  redemptionCode,
  onClose
}: PrizeModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const isWinner = prize !== 'Better Luck Next Time';

  useEffect(() => {
    if (isOpen) {
      setShowConfetti(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleShare = () => {
    // Use LIFF share API if available
    if (typeof window !== 'undefined' && window.liff && window.liff.isApiAvailable('shareTargetPicker')) {
      window.liff.shareTargetPicker([
        {
          type: 'text',
          text: `I just won "${prize}" from LENGOLF Lucky Draw! 🎉\nTry your luck at: ${window.location.href}`
        }
      ]).catch((err) => {
        console.error('Failed to share:', err);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Darkened Backdrop with Blur */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* The Prize Card */}
      <div className="relative w-full max-w-sm bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-700 shadow-2xl shadow-green-900/20 transform transition-all scale-100">

        {/* Confetti animation for winners */}
        {isWinner && showConfetti && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="confetti">
              {[...Array(50)].map((_, i) => (
                <div
                  key={i}
                  className="confetti-piece"
                  style={{
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 3}s`,
                    backgroundColor: ['#22c55e', '#16a34a', '#15803d', '#166534'][Math.floor(Math.random() * 4)]
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Glowing Top Decoration */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-green-600/20 to-transparent pointer-events-none" />

        <div className="relative p-8 text-center">

          {/* Header */}
          <h2 className="text-3xl font-black text-white italic tracking-tighter mb-1 uppercase drop-shadow-lg">
            {isWinner ? 'You Won!' : 'Thank You!'}
          </h2>

          {/* Icon Circle with Glow */}
          <div className="my-8 relative flex items-center justify-center">
            <div className="absolute w-24 h-24 bg-green-500 rounded-full blur-xl opacity-40 animate-pulse"></div>
            <div className="relative w-20 h-20 bg-gradient-to-br from-zinc-800 to-black rounded-full border-2 border-green-500 flex items-center justify-center shadow-lg">
              {isWinner ? (
                <span className="text-4xl">🎁</span>
              ) : (
                <span className="text-4xl">🎯</span>
              )}
            </div>
          </div>

          {/* Prize Details */}
          <h3 className="text-2xl font-bold text-green-400 mb-2 leading-tight">
            {prize}
          </h3>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
            {prizeDescription}
          </p>

          {/* Ticket / Code Section for winners only */}
          {isWinner && (
            <div className="bg-black/40 rounded-xl p-4 border border-dashed border-zinc-600 mb-6 relative group">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Redemption Code</p>
              <p className="text-xl font-mono text-white tracking-widest font-bold select-all">
                {redemptionCode}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {isWinner && (
              <button
                onClick={handleShare}
                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-green-900/50 transition-all transform active:scale-95 uppercase tracking-wide text-sm"
              >
                Share Your Win
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full bg-transparent border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 font-semibold py-3.5 px-4 rounded-xl transition-colors text-sm"
            >
              {isWinner ? 'Close & Spin Again' : 'Close'}
            </button>
          </div>
        </div>

        {/* Footer Note */}
        {isWinner && (
          <div className="bg-zinc-950/50 p-3 text-center border-t border-zinc-800">
            <p className="text-[10px] text-zinc-600">
              Present this code at LENGOLF reception to redeem.
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">
              Mercury Ville @ BTS Chidlom, Floor 4 • Tel: 096-668-2335
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        .confetti {
          position: absolute;
          width: 100%;
          height: 100%;
        }
        .confetti-piece {
          position: absolute;
          width: 10px;
          height: 10px;
          top: -10px;
          opacity: 0;
          animation: confetti-fall 3s linear forwards;
        }
        @keyframes confetti-fall {
          0% {
            opacity: 0;
            transform: translateY(0) rotate(0deg);
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(600px) rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
