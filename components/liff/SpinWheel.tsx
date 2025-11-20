'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface SpinWheelProps {
  customerId: string;
  lineUserId: string;
  onWin: (prize: string, prizeDescription: string, redemptionCode: string, drawsRemaining?: number) => void;
  onBack?: () => void;
}

interface Prize {
  name: string;
  color: string;
}

// Dark/Neon color palette (alternating dark green and black)
const PRIZE_COLORS = [
  '#15803d', // Dark green
  '#18181b', // Near black (zinc-900)
  '#166534', // Forest green
  '#27272a', // Dark zinc
  '#14532d', // Very dark green
  '#3f3f46', // Zinc-700
  '#16a34a', // Medium green
  '#52525b', // Zinc-600
];

export default function SpinWheel({ customerId, lineUserId, onWin, onBack }: SpinWheelProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState('');
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch available prizes from database
  useEffect(() => {
    const fetchPrizes = async () => {
      try {
        const response = await fetch('/api/lucky-draw/campaign-status');
        const data = await response.json();

        if (response.ok && data.prizeBreakdown) {
          // Map prizes with colors, only show prizes with remaining quantity > 0
          const availablePrizes = data.prizeBreakdown
            .filter((p: { remaining: number }) => p.remaining > 0)
            .map((prize: { prize_name: string }, index: number) => ({
              name: prize.prize_name,
              color: PRIZE_COLORS[index % PRIZE_COLORS.length]
            }));

          setPrizes(availablePrizes);
        }
      } catch (err) {
        console.error('Error fetching prizes:', err);
        // Fallback to a simple message
        setPrizes([{ name: 'Loading prizes...', color: '#15803d' }]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrizes();
  }, []);

  const handleSpin = async () => {
    if (isSpinning) return;

    setError('');
    setIsSpinning(true);

    try {
      const response = await fetch('/api/liff/spin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId,
          lineUserId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to spin');
      }

      // Find the index of the winning prize
      const prizeIndex = prizes.findIndex(p => p.name === data.prize);
      const segmentAngle = 360 / prizes.length;
      const targetRotation = 360 * 5 + (360 - (prizeIndex * segmentAngle + segmentAngle / 2));

      setRotation(targetRotation);

      // Wait for animation to complete
      setTimeout(() => {
        onWin(data.prize, data.prizeDescription, data.redemptionCode, data.drawsRemaining);
      }, 4000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsSpinning(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          Lucky Draw
        </h1>
        <p className="text-sm text-zinc-400">
          Spin the wheel to reveal your prize
        </p>
      </div>

      <div className="relative w-full aspect-square max-w-sm mx-auto mb-8">
        {/* Wheel container */}
        <svg
          viewBox="0 0 300 300"
          className="w-full h-full rounded-full border-4 border-zinc-700 shadow-2xl shadow-black/50"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none'
          }}
        >
          {prizes.map((prize, index) => {
            const segmentAngle = 360 / prizes.length;
            const startAngle = index * segmentAngle - 90;
            const endAngle = startAngle + segmentAngle;

            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;

            const x1 = 150 + 150 * Math.cos(startRad);
            const y1 = 150 + 150 * Math.sin(startRad);
            const x2 = 150 + 150 * Math.cos(endRad);
            const y2 = 150 + 150 * Math.sin(endRad);

            const largeArc = segmentAngle > 180 ? 1 : 0;
            const pathData = `M 150,150 L ${x1},${y1} A 150,150 0 ${largeArc},1 ${x2},${y2} Z`;

            // Calculate text position (radial alignment)
            const textAngle = startAngle + segmentAngle / 2;
            const textRad = (textAngle * Math.PI) / 180;
            const textRadius = 95; // Distance from center
            const textX = 150 + textRadius * Math.cos(textRad);
            const textY = 150 + textRadius * Math.sin(textRad);

            // Truncate long prize names for better display
            const displayName = prize.name.length > 12 ? prize.name.substring(0, 10) + '..' : prize.name;

            return (
              <g key={index}>
                <path d={pathData} fill={prize.color} stroke="#27272a" strokeWidth="1" />
                <text
                  x={textX}
                  y={textY}
                  fill="white"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                  className="uppercase tracking-wider"
                >
                  {displayName}
                </text>
              </g>
            );
          })}

          {/* Center circle with glowing logo */}
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <circle cx="150" cy="150" r="35" fill="#18181b" stroke="#22c55e" strokeWidth="3" filter="url(#glow)" />
          <image
            href="/images/lengolf_logo.jpg"
            x="125"
            y="125"
            width="50"
            height="50"
            clipPath="circle(25px at 25px 25px)"
          />
        </svg>

        {/* Neon Green Needle Pointer */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-3 z-10">
          <div className="w-0 h-0 border-l-[20px] border-r-[20px] border-t-[30px] border-l-transparent border-r-transparent border-t-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-800 rounded-xl">
          <p className="text-sm text-red-400 text-center font-medium">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={handleSpin}
          disabled={isSpinning || isLoading || prizes.length === 0}
          className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold py-5 text-lg shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] rounded-xl transition-all disabled:opacity-50 uppercase tracking-widest"
        >
          {isLoading ? 'Loading...' : isSpinning ? 'Spinning...' : 'Spin'}
        </Button>

        {onBack && !isSpinning && (
          <Button
            onClick={onBack}
            variant="outline"
            className="w-full border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-600 py-3 rounded-xl"
          >
            Back
          </Button>
        )}
      </div>

      <div className="mt-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
        <p className="text-xs text-zinc-500 text-center">
          1 Spin earned for every 500 THB spent
        </p>
      </div>
    </div>
  );
}
