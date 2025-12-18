'use client';

import React from 'react';
import Image from 'next/image';
import { Promotion } from '@/lib/liff/promotions-data';
import CountdownTimer from './CountdownTimer';
import StoryActions from './StoryActions';

interface PromotionStoryProps {
  promotion: Promotion;
  onTapLeft: () => void;
  onTapRight: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

export default function PromotionStory({
  promotion,
  onTapLeft,
  onTapRight,
  onHoldStart,
  onHoldEnd,
}: PromotionStoryProps) {
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);

  const handleTouchStart = () => {
    setIsTouchDevice(true);
    onHoldStart();
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault(); // Prevent mouse events from firing
    onHoldEnd();

    const touch = e.changedTouches[0];
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const width = rect.width;

    // Divide into 3 zones: left 30%, center 40%, right 30%
    if (x < width * 0.3) {
      onTapLeft();
    } else if (x > width * 0.7) {
      onTapRight();
    }
    // Center zone just pauses/resumes (handled by touch start/end)
  };

  const handleMouseDown = () => {
    if (isTouchDevice) return; // Skip if touch event already fired
    onHoldStart();
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchDevice) return; // Skip if touch event already fired
    onHoldEnd();

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    // Divide into 3 zones: left 30%, center 40%, right 30%
    if (x < width * 0.3) {
      onTapLeft();
    } else if (x > width * 0.7) {
      onTapRight();
    }
  };

  return (
    <div
      className="relative w-full h-full flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* Image Section - Top 60% */}
      <div className="relative w-full h-[60%] bg-black">
        {/* Badge at top (if present) */}
        {promotion.badge && (
          <div className="absolute top-16 left-5 z-10">
            <span className="inline-block px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider rounded-full shadow-lg">
              {promotion.badge.en}
            </span>
          </div>
        )}

        {/* Centered Image */}
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="relative w-full h-full max-w-[100vh] mx-auto">
            <Image
              src={promotion.image}
              alt={promotion.title.en}
              fill
              className="object-contain"
              sizes="100vw"
              priority
              quality={100}
            />
          </div>
        </div>
      </div>

      {/* Content Section - Bottom 40% with solid background */}
      <div className="relative w-full h-[40%] bg-black flex flex-col justify-start px-5 pt-6 pb-safe">
        {/* Title */}
        <h2 className="text-2xl font-black text-white mb-3 leading-tight">
          {promotion.title.en}
        </h2>

        {/* Description */}
        <p className="text-sm text-white/90 mb-4 leading-relaxed">
          {promotion.description.en}
        </p>

        {/* Countdown Timer */}
        <div className="mb-4">
          <CountdownTimer validUntil={promotion.validUntil} />
        </div>

        {/* Action Buttons */}
        <div className="mt-auto">
          <StoryActions promotion={promotion} />
        </div>
      </div>

      {/* Invisible tap zones for debugging (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-[30%] opacity-0 hover:opacity-10 bg-blue-500 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-[30%] opacity-0 hover:opacity-10 bg-green-500 pointer-events-none" />
        </>
      )}
    </div>
  );
}
