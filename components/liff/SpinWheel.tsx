'use client';

import { useState, useEffect } from 'react';
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

interface SpinWheelProps {
  customerId: string;
  lineUserId: string;
  onWin: (prize: string, prizeDescription: string, redemptionCode: string, imageUrl: string | undefined, drawsRemaining?: number) => void;
  onBack?: () => void;
}

interface Prize {
  name: string;
  color: string;
  textColor: string;
  image_url?: string;
}

// Green, Gold, and White Palette
const PRIZE_COLORS = [
  { bg: '#047857', text: '#FFFFFF' }, // Green-700 & White
  { bg: '#FBBF24', text: '#FFFFFF' }, // Amber-400 & White
  { bg: '#059669', text: '#FFFFFF' }, // Green-600 & White
  { bg: '#F59E0B', text: '#FFFFFF' }, // Amber-500 & White
  { bg: '#10B981', text: '#FFFFFF' }, // Green-500 & White
  { bg: '#D97706', text: '#FFFFFF' }, // Amber-600 & White
];

const getPrizeIcon = (prizeName: string, textColor: string) => {
  const iconProps = {
    className: 'w-10 h-10 mb-1',
    strokeWidth: 2,
    color: textColor,
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

export default function SpinWheel({ customerId, lineUserId, onWin, onBack }: SpinWheelProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState('');
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch available prizes
  useEffect(() => {
    const fetchPrizes = async () => {
      try {
        const response = await fetch('/api/lucky-draw/campaign-status');
        const data = await response.json();

        if (response.ok && data.prizeBreakdown) {
          const availablePrizes = data.prizeBreakdown
            .filter((p: { remaining: number }) => p.remaining > 0)
            .map((prize: { prize_name: string; image_url: string }, index: number) => ({
              name: prize.prize_name,
              color: PRIZE_COLORS[index % PRIZE_COLORS.length].bg,
              textColor: PRIZE_COLORS[index % PRIZE_COLORS.length].text,
            }));

          setPrizes(availablePrizes);
        }
      } catch (err) {
        console.error('Error fetching prizes:', err);
        setPrizes([{ name: 'Loading...', color: '#18181b', textColor: '#fff' }]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrizes();
  }, []);

  const handleSpin = async () => {
    if (isSpinning) return;
    // Optional: Haptic Feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);

    setError('');
    setIsSpinning(true);

    try {
      const response = await fetch('/api/liff/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, lineUserId }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to spin');

      const prizeIndex = prizes.findIndex(p => p.name === data.prize);
      // Default to index 0 if not found to avoid crash
      const safeIndex = prizeIndex === -1 ? 0 : prizeIndex;
      
      const segmentAngle = 360 / prizes.length;
      // Add extra rotations (5 * 360) + alignment adjustment
      // The -90 offset in drawing means 0deg is at 12 o'clock? No, standard SVG 0 is 3 o'clock.
      // We draw segments starting from -90 (12 o'clock).
      // To land on the specific segment under the pointer (at 12 o'clock), 
      // we need to rotate the wheel so that the center of the winning segment is at -90deg.
      
      const randomOffset = (Math.random() * 0.8 - 0.4) * segmentAngle; // Add slight randomness within slice
      const targetRotation = 360 * 8 - (safeIndex * segmentAngle + segmentAngle / 2) + randomOffset;

      setRotation(targetRotation);

      setTimeout(() => {
        onWin(data.prize, data.prizeDescription, data.redemptionCode, data.image_url, data.drawsRemaining);
      }, 4000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsSpinning(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black italic text-green-800 uppercase tracking-tighter mb-2">
          Spin to Win!
        </h1>
        <div className="h-1 w-24 bg-gradient-to-r from-green-500 to-amber-400 mx-auto rounded-full"></div>
      </div>

      <div className="relative w-full aspect-square max-w-[340px] mx-auto mb-10">
        {/* Wheel Glow Background */}
        <div className="absolute inset-0 bg-amber-400/20 rounded-full blur-3xl scale-110 animate-pulse"></div>

        {/* Wheel Container */}
        <div className="relative w-full h-full z-10">
          <svg
            viewBox="0 0 300 300"
            className="w-full h-full rounded-full shadow-[0_0_30px_rgba(0,0,0,0.5)] border-4 border-amber-400"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)' : 'none'
            }}
          >
            {prizes.map((prize, index) => {
              const segmentAngle = 360 / prizes.length;
              const startAngle = index * segmentAngle - 90;
              const endAngle = startAngle + segmentAngle;

              // Calculate path
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = (endAngle * Math.PI) / 180;
              const x1 = 150 + 150 * Math.cos(startRad);
              const y1 = 150 + 150 * Math.sin(startRad);
              const x2 = 150 + 150 * Math.cos(endRad);
              const y2 = 150 + 150 * Math.sin(endRad);
              const largeArc = segmentAngle > 180 ? 1 : 0;
              const pathData = `M 150,150 L ${x1},${y1} A 150,150 0 ${largeArc},1 ${x2},${y2} Z`;

              const midAngle = startAngle + segmentAngle / 2;
              
              // Push text out towards the rim (110px from center)
              const textRad = (midAngle * Math.PI) / 180;
              const textDist = 90; 
              const tx = 150 + textDist * Math.cos(textRad);
              const ty = 150 + textDist * Math.sin(textRad);

              return (
                <g key={index}>
                  <path d={pathData} fill={prize.color} stroke="#09090b" strokeWidth="1" />
                  
                  {/* Icon Group */}
                  <g transform={`translate(${tx}, ${ty}) rotate(${midAngle + 90})`}>
                    <foreignObject x="-40" y="-40" width="80" height="80">
                      <div
                        className="flex flex-col items-center justify-center text-center h-full w-full"
                      >
                        {getPrizeIcon(prize.name, prize.textColor)}
                      </div>
                    </foreignObject>
                  </g>
                </g>
              );
            })}

            {/* Center Hub */}
            <circle cx="150" cy="150" r="40" fill="#18181b" stroke="#FBBF24" strokeWidth="2" />
            <image
              href="/images/lengolf_logo.jpg"
              x="120"
              y="120"
              width="60"
              height="60"
              clipPath="circle(30px at 30px 30px)"
              className="opacity-90"
            />
          </svg>

          {/* The Pointer (Static on top) */}
          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-20 filter drop-shadow-lg">
            <div className="w-8 h-10 bg-gradient-to-b from-amber-400 to-amber-600" 
                 style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600 text-center">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={handleSpin}
          disabled={isSpinning || isLoading || prizes.length === 0}
          className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white font-black italic uppercase py-4 text-xl rounded-xl hover:from-green-500 hover:to-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {isLoading ? 'Loading...' : isSpinning ? 'Best of Luck!' : 'SPIN NOW'}
        </button>

        {onBack && !isSpinning && (
          <button
            onClick={onBack}
            className="w-full text-gray-500 hover:text-green-700 text-sm py-2 transition-colors"
          >
            Back to Dashboard
          </button>
        )}
      </div>
    </div>
  );
}