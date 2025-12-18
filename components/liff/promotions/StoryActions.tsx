'use client';

import { Promotion } from '@/lib/liff/promotions-data';

interface StoryActionsProps {
  promotion: Promotion;
}

export default function StoryActions({ promotion }: StoryActionsProps) {

  const handleAction = () => {
    // Determine action based on CTA type
    if (promotion.ctaType === 'book') {
      const url = promotion.ctaUrl || '/bookings';
      // Check if LIFF is available and use openWindow
      if (typeof window !== 'undefined' && window.liff?.openWindow) {
        window.liff.openWindow({
          url: `${window.location.origin}${url}`,
          external: false,
        });
      } else {
        window.location.href = url;
      }
    } else if (promotion.ctaType === 'contact') {
      window.location.href = 'https://lin.ee/uxQpIXn';
    } else if (promotion.ctaType === 'link' && promotion.ctaUrl) {
      if (typeof window !== 'undefined' && window.liff?.openWindow) {
        window.liff.openWindow({
          url: promotion.ctaUrl.startsWith('http')
            ? promotion.ctaUrl
            : `${window.location.origin}${promotion.ctaUrl}`,
          external: promotion.ctaUrl.startsWith('http'),
        });
      } else {
        window.location.href = promotion.ctaUrl;
      }
    }
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

  return (
    <button
      onClick={handleAction}
      className="w-full bg-primary text-primary-foreground px-6 py-3.5 rounded-xl font-bold text-base hover:opacity-90 active:opacity-80 transition-opacity shadow-lg"
    >
      {getButtonText()}
    </button>
  );
}
