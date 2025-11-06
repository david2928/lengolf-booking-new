'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface PromotionBarProps {
  onPromotionClick: () => void;
  userId?: string | null; // Pass user ID to make dismissal user-specific
}

const PromotionBar: React.FC<PromotionBarProps> = ({ onPromotionClick, userId }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Create user-specific or guest-specific dismissal key
  const getDismissalKey = () => {
    return userId
      ? `lengolf-promo-bar-dismissed-${userId}`
      : 'lengolf-promo-bar-dismissed-guest';
  };

  useEffect(() => {
    const dismissalKey = getDismissalKey();

    // Check if promotion bar was previously dismissed for this user/guest
    const isDismissed = localStorage.getItem(dismissalKey) === 'true';

    if (!isDismissed) {
      // Show the bar with animation
      setTimeout(() => {
        setIsVisible(true);
        setIsAnimating(true);
      }, 300); // Small delay for smoother entrance
    }
  }, [userId]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Animate out
    setIsAnimating(false);

    // Hide after animation completes
    setTimeout(() => {
      setIsVisible(false);
      const dismissalKey = getDismissalKey();
      localStorage.setItem(dismissalKey, 'true');
    }, 300);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`sticky top-[72px] z-40 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 text-gray-900 shadow-md transition-all duration-300 cursor-pointer hover:from-amber-500 hover:via-yellow-500 hover:to-amber-500 ${
        isAnimating ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      onClick={onPromotionClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPromotionClick();
        }
      }}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex items-center justify-center py-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎉</span>
            {/* Shorter text on mobile, full text on larger screens */}
            <span className="font-semibold text-sm sm:text-base">
              <span className="hidden sm:inline">11.11 Deal of the Year - 11% OFF All Packages!</span>
              <span className="sm:hidden">11.11 Sale - 11% OFF All Packages!</span>
            </span>
            <span className="text-xl">🎉</span>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="absolute right-4 sm:right-6 lg:right-8 top-1/2 -translate-y-1/2 p-1 hover:bg-black/10 rounded-md transition-colors"
          aria-label="Dismiss promotion"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default PromotionBar;
