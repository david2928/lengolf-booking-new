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
        ? 'text-gray-400'
        : 'text-green-600'
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
    'Box of Golf Balls': <Circle {...iconProps} />,
    'Golf Ball': <Circle {...iconProps} />,
    'Golf Marker': <MapPin {...iconProps} />,
  };

  return prizeIconMap[prizeName] || <Package {...iconProps} />;
};


export default function PrizeGallery({ prizes, onRedeem }: PrizeGalleryProps) {
  if (prizes.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
        <div className="text-4xl mb-3 opacity-30">🏆</div>
        <p className="text-gray-500 text-sm font-bold">Trophy Case Empty</p>
        <p className="text-gray-400 text-xs mt-1">Start spinning to fill this up!</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-4 pb-safe">
      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        Your Prizes <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-md">{prizes.length}</span>
      </h3>

      <div className="grid grid-cols-1 gap-3">
        {prizes.map((prize) => (
          <div
            key={prize.id}
            className={`relative bg-white border rounded-xl p-4 transition-all overflow-hidden
              ${prize.is_redeemed
                ? 'border-gray-200 opacity-60 grayscale-[0.5]'
                : 'border-green-200 hover:border-amber-300 shadow-md hover:shadow-lg'}`}
          >
            {/* Active Indicator Strip */}
            {!prize.is_redeemed && (
               <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-green-500 to-amber-400"></div>
            )}

            <div className="flex justify-between items-start pl-3">
               <div className="flex items-center">
                {getPrizeIcon(prize.prize_name)}
              <div>
                <h4 className={`text-base font-bold ${prize.is_redeemed ? 'text-gray-400' : 'text-gray-900'}`}>
                  {prize.prize_name}
                </h4>

                <div className="flex items-center gap-3 mt-2">
                   <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded font-mono border border-amber-200">
                     {prize.redemption_code}
                   </span>
                   <span className="text-[10px] text-gray-400">
                     {formatDate(prize.spin_timestamp)}
                   </span>
                </div>
              </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                 {prize.is_redeemed ? (
                    <span className="text-[10px] font-bold text-gray-400 uppercase border border-gray-200 px-2 py-1 rounded bg-gray-50">
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