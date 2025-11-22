'use client';

import {
  ShoppingBag,
  Package,
  CupSoda,
  Clock,
  Percent,
  GlassWater,
  Crown,
  Hand,
  Circle,
  MapPin,
} from 'lucide-react';

import { Prize } from '@/types/liff';

interface PrizeGalleryProps {
  prizes: Prize[];
  onRedeem: (prize: Prize) => void;
}

const getPrizeIcon = (prizeName: string): React.ReactElement => {
  const iconProps = {
    className: `w-8 h-8 mr-4 ${
      prizeName === 'Better Luck Next Time'
        ? 'text-zinc-500'
        : 'text-green-500'
    }`,
    strokeWidth: 1.5,
  };

  const prizeIconMap: { [key: string]: React.ReactElement } = {
    'Golf Bag': <ShoppingBag {...iconProps} />,
    'Bronze Package': <Package {...iconProps} />,
    'Premium Tumbler': <CupSoda {...iconProps} />,
    '2-Hour Bay Voucher': <Clock {...iconProps} />,
    '1-Hour Bay Voucher': <Clock {...iconProps} />,
    '20% Discount': <Percent {...iconProps} />,
    'Drink Voucher': <GlassWater {...iconProps} />,
    'Golf Hat': <Crown {...iconProps} />,
    'Golf Gloves': <Hand {...iconProps} />,
    'Golf Balls': <Circle {...iconProps} />,
    'Golf Marker': <MapPin {...iconProps} />,
  };

  return prizeIconMap[prizeName] || <Package {...iconProps} />;
};


export default function PrizeGallery({ prizes, onRedeem }: PrizeGalleryProps) {
  if (prizes.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl">
        <div className="text-4xl mb-3 opacity-30">🏆</div>
        <p className="text-zinc-500 text-sm font-bold">Trophy Case Empty</p>
        <p className="text-zinc-600 text-xs mt-1">Start spinning to fill this up!</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-4 pb-safe">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">
        Your Prizes <span className="bg-green-500/20 text-green-300 text-xs px-2 py-0.5 rounded-md">{prizes.length}</span>
      </h3>

      <div className="grid grid-cols-1 gap-3">
        {prizes.map((prize) => (
          <div
            key={prize.id}
            className={`relative bg-zinc-900/50 border rounded-xl p-4 transition-all overflow-hidden
              ${prize.is_redeemed 
                ? 'border-zinc-800 opacity-60 grayscale-[0.8]' 
                : 'border-green-500/30 hover:border-amber-400/50 shadow-lg'}`}
          >
            {/* Active Indicator Strip */}
            {!prize.is_redeemed && (
               <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
            )}

            <div className="flex justify-between items-start pl-3">
               <div className="flex items-center">
                {prize.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={prize.image_url} alt={prize.prize_name} className="w-8 h-8 mr-4 object-contain" />
                ) : (
                  getPrizeIcon(prize.prize_name)
                )}
              <div>
                <h4 className={`text-base font-bold ${prize.is_redeemed ? 'text-zinc-500' : 'text-white'}`}>
                  {prize.prize_name}
                </h4>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-1">
                  {prize.prize_description}
                </p>
                
                <div className="flex items-center gap-3 mt-3">
                   <span className="text-[10px] bg-zinc-950 text-zinc-400 px-2 py-1 rounded font-mono border border-zinc-800">
                     {prize.redemption_code}
                   </span>
                   <span className="text-[10px] text-zinc-600">
                     {formatDate(prize.spin_timestamp)}
                   </span>
                </div>
              </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                 {prize.is_redeemed ? (
                    <span className="text-[10px] font-bold text-zinc-500 uppercase border border-zinc-700 px-2 py-1 rounded">
                      Collected
                    </span>
                 ) : (
                    <button
                      onClick={() => onRedeem(prize)}
                      className="bg-green-600 text-white text-xs font-bold px-3 py-2 rounded hover:bg-green-700 transition-colors"
                    >
                      REDEEM
                    </button>
                 )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}