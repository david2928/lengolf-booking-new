'use client';

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  validUntil?: Date;
}

export default function CountdownTimer({ validUntil }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number } | null>(null);

  useEffect(() => {
    if (!validUntil) return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(validUntil).getTime();
      const difference = end - now;

      if (difference <= 0) {
        setTimeLeft(null);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));

      setTimeLeft({ days, hours, minutes });
    };

    // Calculate immediately
    calculateTimeLeft();

    // Update every minute
    const interval = setInterval(calculateTimeLeft, 60000);

    return () => clearInterval(interval);
  }, [validUntil]);

  // Don't render if no expiry date or expired
  if (!validUntil || !timeLeft) {
    return null;
  }

  // Check if urgent (less than 3 days)
  const isUrgent = timeLeft.days < 3;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
        isUrgent
          ? 'bg-red-500/90 text-white animate-pulse'
          : 'bg-yellow-400/90 text-gray-900'
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>
        Expires in{' '}
        {timeLeft.days > 0 && `${timeLeft.days} day${timeLeft.days > 1 ? 's' : ''}`}
        {timeLeft.days === 0 && timeLeft.hours > 0 && `${timeLeft.hours} hour${timeLeft.hours > 1 ? 's' : ''}`}
        {timeLeft.days === 0 && timeLeft.hours === 0 && `${timeLeft.minutes} minute${timeLeft.minutes > 1 ? 's' : ''}`}
      </span>
    </div>
  );
}
