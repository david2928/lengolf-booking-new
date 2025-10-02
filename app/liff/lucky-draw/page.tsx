'use client';

import { useEffect, useState } from 'react';
import PhoneForm from '@/components/liff/PhoneForm';
import SpinWheel from '@/components/liff/SpinWheel';
import PrizeModal from '@/components/liff/PrizeModal';

type ViewState = 'loading' | 'error' | 'phone-form' | 'spin-wheel' | 'already-played';

interface PrizeData {
  prize: string;
  prizeDescription: string;
  redemptionCode: string;
}

export default function LuckyDrawPage() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [lineUserId, setLineUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [prizeData, setPrizeData] = useState<PrizeData | null>(null);
  const [showPrizeModal, setShowPrizeModal] = useState(false);

  useEffect(() => {
    initializeLiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeLiff = async () => {
    try {
      // DEV MODE: Test without LIFF (use query param ?dev=true&userId=testUser)
      const urlParams = new URLSearchParams(window.location.search);
      const devMode = urlParams.get('dev') === 'true';

      if (devMode && process.env.NODE_ENV === 'development') {
        const testUserId = urlParams.get('userId') || 'U-test-user-123';
        const testName = urlParams.get('name') || 'Test User';
        console.log('[DEV MODE] Bypassing LIFF initialization');
        setLineUserId(testUserId);
        setDisplayName(testName);
        await checkUserStatus(testUserId);
        return;
      }

      // Load LIFF SDK from CDN if not already loaded
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

      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId || liffId === 'your-liff-id-here') {
        throw new Error('LIFF ID not configured. Please register your LIFF app in LINE Developers Console and update NEXT_PUBLIC_LIFF_ID in .env.local');
      }

      await window.liff.init({ liffId }).catch((err) => {
        if (err.message.includes('channel not found')) {
          throw new Error('Invalid LIFF ID. Please check your LINE Developers Console and verify the LIFF ID is correct.');
        }
        throw err;
      });

      if (!window.liff.isLoggedIn()) {
        // Redirect to login with current URL as redirectUri to skip confirmation screen
        window.liff.login({ redirectUri: window.location.href });
        return;
      }

      const profile = await window.liff.getProfile();
      setLineUserId(profile.userId);
      setDisplayName(profile.displayName);

      await checkUserStatus(profile.userId);

    } catch (err) {
      console.error('LIFF initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize LINE app');
      setViewState('error');
    }
  };

  const checkUserStatus = async (userId: string) => {
    try {
      const response = await fetch(`/api/liff/check-status?lineUserId=${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check status');
      }

      if (data.hasPlayed) {
        // User already played - show their previous result
        setPrizeData({
          prize: data.prize,
          prizeDescription: data.prizeDescription,
          redemptionCode: data.redemptionCode
        });
        setViewState('already-played');
        setShowPrizeModal(true);
      } else if (data.needsPhone) {
        // Need to collect phone number
        setViewState('phone-form');
      } else {
        // Ready to spin
        setViewState('spin-wheel');
      }
    } catch (err) {
      console.error('Status check error:', err);
      setError(err instanceof Error ? err.message : 'Failed to check status');
      setViewState('error');
    }
  };

  const handlePhoneSuccess = () => {
    setViewState('spin-wheel');
  };

  const handleWin = (prize: string, prizeDescription: string, redemptionCode: string) => {
    setPrizeData({ prize, prizeDescription, redemptionCode });
    setShowPrizeModal(true);
    setViewState('already-played');
  };

  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-[#f5fef9] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#005a32] border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-[#f5fef9] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-[#005a32] text-white px-6 py-2 rounded-md hover:bg-[#004225] transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5fef9]">
      <div className="container mx-auto px-4 py-8">
        {viewState === 'phone-form' && (
          <PhoneForm
            lineUserId={lineUserId}
            displayName={displayName}
            onSuccess={handlePhoneSuccess}
          />
        )}

        {viewState === 'spin-wheel' && (
          <SpinWheel
            lineUserId={lineUserId}
            onWin={handleWin}
          />
        )}

        {viewState === 'already-played' && !showPrizeModal && (
          <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg text-center">
            <div className="w-20 h-20 bg-[#f5fef9] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-[#005a32]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Already Played!
            </h2>
            <p className="text-gray-600 mb-4">
              You won: <span className="font-bold text-[#005a32]">{prizeData?.prize}</span>
            </p>
            <button
              onClick={() => setShowPrizeModal(true)}
              className="bg-[#005a32] text-white px-6 py-3 rounded-md hover:bg-[#004225] transition-colors"
            >
              View Prize Details
            </button>
          </div>
        )}
      </div>

      {prizeData && (
        <PrizeModal
          isOpen={showPrizeModal}
          prize={prizeData.prize}
          prizeDescription={prizeData.prizeDescription}
          redemptionCode={prizeData.redemptionCode}
          onClose={() => setShowPrizeModal(false)}
        />
      )}
    </div>
  );
}
