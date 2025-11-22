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
      {/* Customizing the Content Class to be fully dark */}
      <DialogContent className="bg-zinc-900 border border-zinc-700 text-white sm:max-w-md shadow-[0_0_50px_rgba(0,0,0,0.8)] p-0 overflow-hidden gap-0">
        
        {/* Decorative Header Background */}
        <div className={`h-24 w-full ${isWinner ? 'bg-gradient-to-br from-red-600 to-red-800' : 'bg-zinc-800'} relative`}>
           <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
              <div className={`w-16 h-16 rounded-full border-4 border-zinc-900 flex items-center justify-center shadow-lg ${isWinner ? 'bg-amber-400 text-zinc-900' : 'bg-zinc-700 text-zinc-400'}`}>
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
          <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-2 text-white">
            {isWinner ? 'Congratulations!' : 'So Close!'}
          </h2>
          <p className={`text-xl font-bold mb-2 ${isWinner ? 'text-amber-400' : 'text-zinc-400'}`}>
            {prize}
          </p>
          <p className="text-sm text-zinc-500 mb-6">
            {prizeDescription}
          </p>

          {isWinner && (
            <div className="bg-black/40 rounded-xl p-4 border border-dashed border-zinc-700 mb-6 relative">
               <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Staff Code</p>
               <p className="text-2xl font-mono font-bold text-white tracking-widest select-all">
                 {redemptionCode}
               </p>
            </div>
          )}

          <div className="space-y-3">
            {isWinner && (
              <Button onClick={handleShare} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700">
                Share with Friends
              </Button>
            )}
            <Button onClick={onClose} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold">
              {isWinner ? 'Collect & Close' : 'Try Again'}
            </Button>
          </div>
          
          <p className="text-[10px] text-zinc-600 mt-4">
            Valid for 30 days • Mercury Ville @ Chidlom
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}