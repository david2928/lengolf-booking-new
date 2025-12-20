'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { promotions } from '@/lib/liff/promotions-data';
import StoryProgress from '@/components/liff/promotions/StoryProgress';
import PromotionStory from '@/components/liff/promotions/PromotionStory';

type ViewState = 'loading' | 'error' | 'ready';

const STORY_DURATION = 5000; // 5 seconds per story

export default function PromotionsPage() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedTimeRef = useRef<number>(0);

  // Initialize LIFF
  useEffect(() => {
    initializePage();
  }, []);

  const initializePage = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const devMode = urlParams.get('dev') === 'true';

      if (devMode && process.env.NODE_ENV === 'development') {
        console.log('[DEV MODE] Promotions page loaded without LIFF');
        setViewState('ready');
        return;
      }

      if (!window.liff) {
        const script = document.createElement('script');
        script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
        script.async = true;
        document.body.appendChild(script);

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      const liffId = process.env.NEXT_PUBLIC_LIFF_PROMOTIONS_ID;
      if (!liffId || liffId === 'your-liff-id-here') {
        console.log('[Promotions] LIFF ID not configured - running without LIFF features');
        setViewState('ready');
        return;
      }

      await window.liff.init({ liffId }).catch((err) => {
        console.warn('[Promotions] LIFF init failed - continuing without LIFF features:', err);
        setViewState('ready');
        return;
      });

      setViewState('ready');
    } catch (err) {
      console.error('Error initializing page:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize page');
      setViewState('ready'); // Continue anyway
    }
  };

  const handleNext = useCallback(() => {
    // Clear interval FIRST to prevent race condition
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Manual navigation forward
    setCurrentIndex((prev) => {
      if (prev < promotions.length - 1) {
        return prev + 1;
      }
      // Stay on last promotion, don't close
      return prev;
    });
  }, []);

  const handlePrev = useCallback(() => {
    // Clear interval FIRST to prevent race condition
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Manual navigation backward
    setCurrentIndex((prev) => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev;
    });
  }, []);

  // Auto-advance timer - resets whenever story changes
  useEffect(() => {
    if (viewState !== 'ready') return;

    // Reset progress and time when story changes
    setProgress(0);
    elapsedTimeRef.current = 0;
    startTimeRef.current = Date.now();

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [currentIndex, viewState]);

  // Timer interval - separate effect for pause/resume
  useEffect(() => {
    if (viewState !== 'ready' || isPaused) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      return;
    }

    // Start/resume timer
    startTimeRef.current = Date.now() - elapsedTimeRef.current;

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const progressPercent = (elapsed / STORY_DURATION) * 100;

      if (progressPercent >= 100) {
        // Time's up - advance to next
        handleNext();
      } else {
        setProgress(progressPercent);
        elapsedTimeRef.current = elapsed;
      }
    }, 50);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [viewState, isPaused, currentIndex, handleNext]);

  const handleHoldStart = () => {
    setIsPaused(true);
  };

  const handleHoldEnd = () => {
    setIsPaused(false);
  };

  // Loading State
  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  // Error State (still show content)
  if (viewState === 'error' && error) {
    console.error('Page error:', error);
  }

  // Main Stories View
  return (
    <div className="fixed inset-0 bg-black overflow-hidden w-screen h-screen">
      {/* Story Progress Bars */}
      <div className="absolute top-0 left-0 right-0 z-20 pt-3 safe-top">
        <StoryProgress total={promotions.length} current={currentIndex} progress={progress} />
      </div>

      {/* Current Story */}
      <div className="w-full h-full">
        <PromotionStory
          promotion={promotions[currentIndex]}
          onTapLeft={handlePrev}
          onTapRight={handleNext}
          onHoldStart={handleHoldStart}
          onHoldEnd={handleHoldEnd}
        />
      </div>
    </div>
  );
}
