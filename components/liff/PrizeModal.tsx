'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';

import { Button } from '@/components/ui/button';

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Customizing the Content Class to be light themed */}
      <DialogContent className="bg-white border border-gray-200 text-gray-900 sm:max-w-md shadow-xl p-0 overflow-hidden gap-0">

        {/* Decorative Header Background */}
        <div className={`h-24 w-full ${isWinner ? 'bg-gradient-to-br from-green-500 to-green-700' : 'bg-gray-100'} relative`}>
           <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
              <div className={`w-16 h-16 rounded-full border-4 border-white flex items-center justify-center shadow-lg ${isWinner ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-400'}`}>
                      {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={prize} className="w-12 h-12 object-contain" />
                ) : isWinner ? (
                   <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
                ) : (
                   <span className="text-2xl">😢</span>
                )}
              </div>
           </div>

           {/* Confetti if winner */}
           {isWinner && (
             <div className="absolute inset-0 opacity-50">
                {/* Add your confetti component here or use CSS generic particles */}
             </div>
           )}
        </div>

        <div className="pt-12 pb-8 px-6 text-center">
          <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-2 text-gray-900">
            {isWinner ? 'Congratulations!' : 'So Close!'}
          </h2>
          <p className={`text-xl font-bold mb-2 ${isWinner ? 'text-green-600' : 'text-gray-400'}`}>
            {prize}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            {prizeDescription}
          </p>

          {isWinner && (
            <div className="bg-amber-50 rounded-xl p-4 border border-dashed border-amber-300 mb-6 relative">
               <p className="text-[10px] uppercase tracking-widest text-amber-600 mb-1">Staff Code</p>
               <p className="text-2xl font-mono font-bold text-amber-700 tracking-widest select-all">
                 {redemptionCode}
               </p>
            </div>
          )}

          <div className="space-y-3">
            {isWinner && (
              <Button onClick={handleShare} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200">
                Share with Friends
              </Button>
            )}
            <Button onClick={onClose} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold">
              {isWinner ? 'Collect & Close' : 'Try Again'}
            </Button>
          </div>

          <p className="text-[10px] text-gray-400 mt-4">
            Valid for 30 days • Mercury Ville @ Chidlom
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}