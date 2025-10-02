'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  const isWinner = prize !== 'Better Luck Next Time';

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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold text-gray-900">
            {isWinner ? 'Congratulations!' : 'Thank You!'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Confetti animation for winners */}
          {isWinner && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="confetti">
                {[...Array(50)].map((_, i) => (
                  <div
                    key={i}
                    className="confetti-piece"
                    style={{
                      left: `${Math.random() * 100}%`,
                      animationDelay: `${Math.random() * 3}s`,
                      backgroundColor: ['#005a32', '#2b6f36', '#3d8b4a', '#4caf50'][Math.floor(Math.random() * 4)]
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="text-center space-y-3">
            <div className="w-20 h-20 bg-[#f5fef9] rounded-full flex items-center justify-center mx-auto mb-4">
              {isWinner ? (
                <svg className="w-10 h-10 text-[#005a32]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
              ) : (
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            <h3 className="text-2xl font-bold text-gray-900">
              {prize}
            </h3>

            <p className="text-gray-600">
              {prizeDescription}
            </p>
          </div>

          {isWinner && (
            <div className="bg-[#f5fef9] border-2 border-[#005a32] rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700 text-center">
                Your Redemption Code
              </p>
              <div className="bg-white p-3 rounded-md border border-[#005a32]/30">
                <p className="text-lg font-mono font-bold text-center text-[#005a32]">
                  {redemptionCode}
                </p>
              </div>
              <p className="text-xs text-gray-500 text-center">
                Show this code to our staff at LENGOLF
              </p>
            </div>
          )}

          <div className="space-y-2">
            {isWinner && (
              <Button
                onClick={handleShare}
                variant="outline"
                className="w-full border-[#005a32] text-[#005a32] hover:bg-[#f5fef9]"
              >
                Share Your Win
              </Button>
            )}

            <Button
              onClick={onClose}
              className="w-full bg-[#005a32] hover:bg-[#004225] text-white"
            >
              {isWinner ? 'Close' : 'Close'}
            </Button>
          </div>

          <div className="text-center space-y-1">
            <p className="text-xs text-gray-500">
              Mercury Ville @ BTS Chidlom, Floor 4
            </p>
            {isWinner && (
              <p className="text-xs text-gray-500">
                Valid for 30 days • Tel: 096-668-2335
              </p>
            )}
          </div>
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
            to {
              opacity: 1;
              transform: translateY(600px) rotate(360deg);
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
