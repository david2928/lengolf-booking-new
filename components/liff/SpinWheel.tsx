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

// Color palette for different prize tiers (alternating greens)
const PRIZE_COLORS = [
  '#005a32', // Dark green
  '#2b6f36', // Medium dark green
  '#3d8b4a', // Medium green
  '#006a3b', // Forest green
  '#4caf50', // Light green
  '#1b5e20', // Very dark green
  '#2e7d32', // Dark green 2
  '#388e3c', // Medium green 2
  '#43a047', // Light green 2
  '#66bb6a', // Lighter green
  '#81c784'  // Lightest green
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
        setPrizes([{ name: 'Loading prizes...', color: '#005a32' }]);
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Lucky Draw
        </h1>
        <p className="text-sm text-gray-600">
          Spin the wheel to reveal your prize
        </p>
      </div>

      <div className="relative w-full aspect-square max-w-sm mx-auto mb-8">
        {/* Wheel container */}
        <svg
          viewBox="0 0 300 300"
          className="w-full h-full rounded-full shadow-2xl"
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

            const textAngle = startAngle + segmentAngle / 2;
            const textRad = (textAngle * Math.PI) / 180;
            const textRadius = 105; // Move text closer to edge
            const textX = 150 + textRadius * Math.cos(textRad);
            const textY = 150 + textRadius * Math.sin(textRad);

            // Split text into words for 2 lines
            const words = prize.name.split(' ');
            const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
            const line2 = words.slice(Math.ceil(words.length / 2)).join(' ');

            return (
              <g key={index}>
                <path d={pathData} fill={prize.color} stroke="white" strokeWidth="2" />
                <text
                  x={textX}
                  y={textY}
                  fill="white"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                >
                  <tspan x={textX} dy="-6">{line1}</tspan>
                  {line2 && <tspan x={textX} dy="12">{line2}</tspan>}
                </text>
              </g>
            );
          })}

          {/* Center circle with logo */}
          <circle cx="150" cy="150" r="35" fill="white" stroke="#005a32" strokeWidth="4" />
          <image
            href="/images/lengolf_logo.jpg"
            x="125"
            y="125"
            width="50"
            height="50"
            clipPath="circle(25px at 25px 25px)"
          />
        </svg>

        {/* Pointer */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-3 z-10">
          <div className="w-0 h-0 border-l-[20px] border-r-[20px] border-t-[30px] border-l-transparent border-r-transparent border-t-[#005a32] drop-shadow-lg"></div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-r">
          <p className="text-sm text-red-700 text-center font-medium">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={handleSpin}
          disabled={isSpinning || isLoading || prizes.length === 0}
          className="w-full bg-[#005a32] hover:bg-[#004225] text-white font-bold py-5 text-lg shadow-sm rounded-lg transition-all disabled:opacity-70"
        >
          {isLoading ? 'Loading...' : isSpinning ? 'Spinning...' : 'Spin'}
        </Button>

        {onBack && !isSpinning && (
          <Button
            onClick={onBack}
            variant="outline"
            className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 py-3"
          >
            Back
          </Button>
        )}
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600 text-center">
          Earn draws with transactions over 500 THB
        </p>
      </div>
    </div>
  );
}
