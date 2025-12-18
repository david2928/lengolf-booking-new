'use client';

import { Promotion } from '@/lib/liff/promotions-data';

interface StoryActionsProps {
  promotion: Promotion;
}

export default function StoryActions({ promotion }: StoryActionsProps) {

  const getActionUrl = () => {
    if (promotion.ctaType === 'book') {
      return promotion.ctaUrl || '/bookings';
    } else if (promotion.ctaType === 'contact') {
      return 'https://lin.ee/uxQpIXn';
    } else if (promotion.ctaType === 'link' && promotion.ctaUrl) {
      return promotion.ctaUrl;
    }
    return '/bookings';
  };

  const getButtonText = () => {
    switch (promotion.ctaType) {
      case 'book':
        return 'Book Now';
      case 'contact':
        return 'Contact Us';
      case 'link':
        return 'Learn More';
      default:
        return 'Book Now';
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
  };

  return (
    <a
      href={getActionUrl()}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      className="block w-full bg-primary text-primary-foreground px-6 py-3.5 rounded-xl font-bold text-base text-center hover:opacity-90 active:opacity-80 transition-opacity shadow-lg"
    >
      {getButtonText()}
    </a>
  );
}
