'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import NotLinkedView from '@/components/liff/NotLinkedView';
import DrawCounter from '@/components/liff/DrawCounter';
import PrizeGallery from '@/components/liff/PrizeGallery';
import SpinWheel from '@/components/liff/SpinWheel';
import PrizeModal from '@/components/liff/PrizeModal';
import StaffRedemptionModal from '@/components/liff/StaffRedemptionModal';

type ViewState = 'loading' | 'error' | 'not-linked' | 'landing' | 'spin-wheel';

interface Prize {
  id: string;
  prize_name: string;
  prize_description: string;
  redemption_code: string;
  spin_timestamp: string;
  is_redeemed: boolean;
  redeemed_at: string | null;
  redeemed_by_staff_name: string | null;
  draw_sequence: number;
}

interface PrizeData {
  prize: string;
  prizeDescription: string;
  redemptionCode: string;
}

export default function LuckyDrawPage() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [lineUserId, setLineUserId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState('');
  const [drawsAvailable, setDrawsAvailable] = useState(0);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [latestPrize, setLatestPrize] = useState<PrizeData | null>(null);
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [prizeToRedeem, setPrizeToRedeem] = useState<Prize | null>(null);
  const [showRedemptionModal, setShowRedemptionModal] = useState(false);
  const [campaignActive, setCampaignActive] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    initializeLiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeLiff = async () => {
    try {
      // DEV MODE: Test without LIFF (use query param ?dev=true&userId=testUser&customerId=uuid)
      const urlParams = new URLSearchParams(window.location.search);
      const devMode = urlParams.get('dev') === 'true';

      if (devMode && process.env.NODE_ENV === 'development') {
        const testUserId = urlParams.get('userId') || 'U-test-user-123';
        const testCustomerId = urlParams.get('customerId') || '';
        console.log('[DEV MODE] Bypassing LIFF initialization');
        setLineUserId(testUserId);

        if (testCustomerId) {
          setCustomerId(testCustomerId);
          await checkCustomerStatus(testCustomerId);
        } else {
          // Simulate not linked
          setViewState('not-linked');
        }
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
        window.liff.login({ redirectUri: window.location.href });
        return;
      }

      const profile = await window.liff.getProfile();
      setLineUserId(profile.userId);

      await checkUserStatus(profile.userId);

    } catch (err) {
      console.error('[lucky-draw] LIFF initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize LINE app');
      setViewState('error');
    }
  };

  const checkUserStatus = async (userId: string) => {
    try {
      // Get profile and check if customer_id is linked
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('customer_id')
        .eq('provider', 'line')
        .eq('provider_id', userId)
        .single();

      if (profileError || !profile) {
        console.error('[lucky-draw] Profile not found:', profileError);
        setViewState('not-linked');
        return;
      }

      if (!profile.customer_id) {
        // Profile exists but not linked to customer
        setViewState('not-linked');
        return;
      }

      // Customer is linked, check their draws and prizes
      setCustomerId(profile.customer_id);
      await checkCustomerStatus(profile.customer_id);

    } catch (err) {
      console.error('[lucky-draw] Status check error:', err);
      setError(err instanceof Error ? err.message : 'Failed to check status');
      setViewState('error');
    }
  };

  const checkCustomerStatus = async (customerId: string) => {
    try {
      const response = await fetch(`/api/lucky-draw/customer-status?customerId=${customerId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check status');
      }

      setDrawsAvailable(data.draws_available || 0);
      setPrizes(data.prizes || []);
      setCampaignActive(data.campaignActive !== false); // Default to true if not provided
      setViewState('landing');

    } catch (err) {
      console.error('[lucky-draw] Customer status error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setViewState('error');
    }
  };

  const handleSpinClick = () => {
    setViewState('spin-wheel');
  };

  const handleWin = async (prize: string, prizeDescription: string, redemptionCode: string, drawsRemaining?: number) => {
    setLatestPrize({ prize, prizeDescription, redemptionCode });
    setShowPrizeModal(true);

    // Update draws count
    if (typeof drawsRemaining === 'number') {
      setDrawsAvailable(drawsRemaining);
    }

    // Refresh prizes list
    await refreshPrizes();

    // Return to landing after showing modal
    setTimeout(() => {
      setViewState('landing');
    }, 500);
  };

  const refreshPrizes = async () => {
    if (!customerId) return;

    try {
      const response = await fetch(`/api/lucky-draw/customer-status?customerId=${customerId}`);
      const data = await response.json();

      if (response.ok) {
        setPrizes(data.prizes || []);
        setDrawsAvailable(data.draws_available || 0);
        setCampaignActive(data.campaignActive !== false);
      }
    } catch (err) {
      console.error('[lucky-draw] Error refreshing prizes:', err);
    }
  };

  const handleRedeemClick = (prize: Prize) => {
    setPrizeToRedeem(prize);
    setShowRedemptionModal(true);
  };

  const handleConfirmRedemption = async (staffName: string) => {
    if (!prizeToRedeem) return;

    try {
      const response = await fetch('/api/lucky-draw/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prizeId: prizeToRedeem.id,
          staffName
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to redeem prize');
      }

      // Success! Refresh prizes to show updated status
      await refreshPrizes();

      // Close modal
      setShowRedemptionModal(false);
      setPrizeToRedeem(null);

      // Show success message (optional - could add a toast notification)
      console.log('[lucky-draw] Prize redeemed successfully by', staffName);

    } catch (err) {
      console.error('[lucky-draw] Redemption error:', err);
      throw err; // Re-throw to let modal handle the error
    }
  };

  const handleClosePrizeModal = () => {
    setShowPrizeModal(false);
    // If user is on spin wheel view, return to landing
    if (viewState === 'spin-wheel') {
      setViewState('landing');
    }
  };

  // Loading State
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

  // Error State
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

  // Not Linked State
  if (viewState === 'not-linked') {
    return <NotLinkedView />;
  }

  // Spin Wheel State
  if (viewState === 'spin-wheel') {
    return (
      <div className="min-h-screen bg-[#f5fef9]">
        <div className="container mx-auto px-4 py-8">
          <SpinWheel
            customerId={customerId}
            lineUserId={lineUserId}
            onWin={handleWin}
            onBack={() => setViewState('landing')}
          />
        </div>

        {latestPrize && (
          <PrizeModal
            isOpen={showPrizeModal}
            prize={latestPrize.prize}
            prizeDescription={latestPrize.prizeDescription}
            redemptionCode={latestPrize.redemptionCode}
            onClose={handleClosePrizeModal}
          />
        )}
      </div>
    );
  }

  // Landing/Dashboard State
  return (
    <div className="min-h-screen bg-[#f5fef9]">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🏌️ LENGOLF Lucky Draw
          </h1>
          <p className="text-gray-600">
            Complete transactions over 500 THB to earn draws!
          </p>
        </div>

        {/* Draw Counter */}
        <DrawCounter
          drawsAvailable={drawsAvailable}
          onSpinClick={handleSpinClick}
          campaignActive={campaignActive}
        />

        {/* Prize Gallery */}
        <div className="max-w-4xl mx-auto">
          <PrizeGallery
            prizes={prizes}
            onRedeem={handleRedeemClick}
          />
        </div>

        {/* Redemption Modal */}
        <StaffRedemptionModal
          isOpen={showRedemptionModal}
          prize={prizeToRedeem}
          onClose={() => {
            setShowRedemptionModal(false);
            setPrizeToRedeem(null);
          }}
          onConfirm={handleConfirmRedemption}
        />

        {/* Prize Modal (for newly won prizes) */}
        {latestPrize && (
          <PrizeModal
            isOpen={showPrizeModal}
            prize={latestPrize.prize}
            prizeDescription={latestPrize.prizeDescription}
            redemptionCode={latestPrize.redemptionCode}
            onClose={handleClosePrizeModal}
          />
        )}
      </div>
    </div>
  );
}
