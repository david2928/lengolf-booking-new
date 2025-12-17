'use client';

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
  const handleTouchStart = () => {
    onHoldStart();
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
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

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
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
      className="relative w-full h-full"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleMouseUp}
    >
      {/* Background - Solid color for letterboxing */}
      <div className="absolute inset-0 bg-black" />

      {/* Centered Image */}
      <div className="absolute inset-0 w-full h-full flex items-center justify-center">
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

      {/* Gradient Overlay for Text Readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent pointer-events-none" />

      {/* Badge at top (if present) */}
      {promotion.badge && (
        <div className="absolute top-20 left-5 z-10">
          <span className="inline-block px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider rounded-full shadow-lg">
            {promotion.badge.en}
          </span>
        </div>
      )}

      {/* Content Container */}
      <div className="relative h-full flex flex-col justify-end p-5 pb-safe">
        {/* Title */}
        <h2 className="text-3xl font-black text-white mb-3 drop-shadow-2xl leading-tight">
          {promotion.title.en}
        </h2>

        {/* Description */}
        <p className="text-base text-white/95 mb-4 drop-shadow-lg leading-relaxed max-w-lg">
          {promotion.description.en}
        </p>

        {/* Countdown Timer */}
        <div className="mb-5">
          <CountdownTimer validUntil={promotion.validUntil} />
        </div>

        {/* Action Buttons */}
        <StoryActions promotion={promotion} />
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
