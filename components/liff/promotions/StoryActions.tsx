'use client';

import { Promotion } from '@/lib/liff/promotions-data';

interface StoryActionsProps {
  promotion: Promotion;
  onShare?: () => void;
}

export default function StoryActions({ promotion, onShare }: StoryActionsProps) {

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

  const handleShare = () => {
    // Try to use LIFF shareTargetPicker if available
    if (typeof window !== 'undefined' && window.liff?.shareTargetPicker && window.liff.isApiAvailable('shareTargetPicker')) {
      const url = `${window.location.origin}/liff/promotions`;
      window.liff
        .shareTargetPicker([
          {
            type: 'text',
            text: `🎉 ${promotion.title.en}\n\n${promotion.description.en}\n\nCheck it out: ${url}`,
          },
        ])
        .then(() => {
          console.log('[Promotions] Shared successfully');
        })
        .catch((error) => {
          console.error('[Promotions] Share failed:', error);
        });
    } else if (onShare) {
      onShare();
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
    <div className="flex gap-3">
      <button
        onClick={handleAction}
        className="flex-1 bg-primary text-primary-foreground px-6 py-3.5 rounded-xl font-bold text-base hover:opacity-90 active:opacity-80 transition-opacity shadow-lg"
      >
        {getButtonText()}
      </button>
      <button
        onClick={handleShare}
        className="bg-white/20 backdrop-blur-sm text-white px-5 py-3.5 rounded-xl font-semibold hover:bg-white/30 active:bg-white/40 transition-all shadow-lg border border-white/30"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
      </button>
    </div>
  );
}
