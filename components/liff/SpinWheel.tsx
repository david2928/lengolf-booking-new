'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface SpinWheelProps {
  lineUserId: string;
  onWin: (prize: string, prizeDescription: string, redemptionCode: string) => void;
}

const PRIZES = [
  { name: 'Free Bay Hour', color: '#005a32', emoji: '🏌️' },
  { name: '10% Discount', color: '#2b6f36', emoji: '💰' },
  { name: 'Free Drink', color: '#3d8b4a', emoji: '🍹' },
  { name: 'Better Luck Next Time', color: '#888888', emoji: '🎯' },
  { name: '500 THB Voucher', color: '#006a3b', emoji: '🎁' },
  { name: 'Free Golf Lesson', color: '#4caf50', emoji: '⛳' }
];

export default function SpinWheel({ lineUserId, onWin }: SpinWheelProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState('');

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
        body: JSON.stringify({ lineUserId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to spin');
      }

      // Find the index of the winning prize
      const prizeIndex = PRIZES.findIndex(p => p.name === data.prize);
      const segmentAngle = 360 / PRIZES.length;
      const targetRotation = 360 * 5 + (360 - (prizeIndex * segmentAngle + segmentAngle / 2));

      setRotation(targetRotation);

      // Wait for animation to complete
      setTimeout(() => {
        onWin(data.prize, data.prizeDescription, data.redemptionCode);
      }, 4000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsSpinning(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          LENGOLF Lucky Draw
        </h1>
        <p className="text-gray-600">
          Spin the wheel for exclusive prizes!
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
          {PRIZES.map((prize, index) => {
            const segmentAngle = 360 / PRIZES.length;
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

          {/* Center circle */}
          <circle cx="150" cy="150" r="30" fill="white" stroke="#005a32" strokeWidth="4" />
          <text x="150" y="150" fontSize="24" textAnchor="middle" dominantBaseline="middle">🏌️</text>
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

      <Button
        onClick={handleSpin}
        disabled={isSpinning}
        className="w-full bg-[#005a32] hover:bg-[#004225] text-white font-bold py-6 text-lg shadow-lg rounded-lg transition-all disabled:opacity-70"
      >
        {isSpinning ? 'Spinning...' : 'SPIN NOW!'}
      </Button>

      <div className="mt-6 p-4 bg-[#f5fef9] border border-[#005a32]/20 rounded-lg">
        <p className="text-xs text-gray-700 text-center">
          ✨ One spin per user • Valid for 30 days • Redeem at LENGOLF
        </p>
      </div>
    </div>
  );
}
