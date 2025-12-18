'use client';

import { Promotion } from '@/lib/liff/promotions-data';

interface StoryActionsProps {
  promotion: Promotion;
}

export default function StoryActions({ promotion }: StoryActionsProps) {

  const handleAction = () => {
    console.log('[StoryActions] Button clicked:', {
      ctaType: promotion.ctaType,
      ctaUrl: promotion.ctaUrl,
      liffAvailable: typeof window !== 'undefined' && !!window.liff,
      liffIsInClient: typeof window !== 'undefined' && window.liff?.isInClient?.()
    });

    // Determine action based on CTA type
    if (promotion.ctaType === 'book') {
      const url = promotion.ctaUrl || '/bookings';
      const fullUrl = `${window.location.origin}${url}`;
      console.log('[StoryActions] Opening booking URL:', fullUrl);

      // For in-app navigation, use openWindow with external: true to open in in-app browser
      if (typeof window !== 'undefined' && window.liff?.isInClient?.() && window.liff?.openWindow) {
        console.log('[StoryActions] Using liff.openWindow');
        window.liff.openWindow({
          url: fullUrl,
          external: true, // Open in external browser for better compatibility
        });
      } else {
        console.log('[StoryActions] Using window.location.href');
        window.location.href = url;
      }
    } else if (promotion.ctaType === 'contact') {
      console.log('[StoryActions] Opening contact LINE URL');
      if (typeof window !== 'undefined' && window.liff?.openWindow) {
        window.liff.openWindow({
          url: 'https://lin.ee/uxQpIXn',
          external: true,
        });
      } else {
        window.location.href = 'https://lin.ee/uxQpIXn';
      }
    } else if (promotion.ctaType === 'link' && promotion.ctaUrl) {
      const isExternal = promotion.ctaUrl.startsWith('http');
      const fullUrl = isExternal ? promotion.ctaUrl : `${window.location.origin}${promotion.ctaUrl}`;
      console.log('[StoryActions] Opening link:', fullUrl, 'external:', isExternal);

      if (typeof window !== 'undefined' && window.liff?.isInClient?.() && window.liff?.openWindow) {
        console.log('[StoryActions] Using liff.openWindow');
        window.liff.openWindow({
          url: fullUrl,
          external: true, // Open in external browser for better compatibility
        });
      } else {
        console.log('[StoryActions] Using window.location.href');
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

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    handleAction();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  return (
    <button
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="w-full bg-primary text-primary-foreground px-6 py-3.5 rounded-xl font-bold text-base hover:opacity-90 active:opacity-80 transition-opacity shadow-lg"
    >
      {getButtonText()}
    </button>
  );
}
