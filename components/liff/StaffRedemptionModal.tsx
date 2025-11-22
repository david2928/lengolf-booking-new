'use client';

import { useState } from 'react';

import { Prize } from '@/types/liff';

interface StaffRedemptionModalProps {
  isOpen: boolean;
  prize: Prize | null;
  onClose: () => void;
  onConfirm: (staffName: string) => Promise<void>;
}

export default function StaffRedemptionModal({
  isOpen,
  prize,
  onClose,
  onConfirm
}: StaffRedemptionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !prize) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      await onConfirm('Staff'); // Just pass a generic staff name
      // Success handled by parent component
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to redeem prize');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative animate-in fade-in zoom-in duration-200">
        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[#005a32]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#005a32]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">
            Prize Redemption
          </h3>
          <p className="text-sm text-gray-600">Confirm to redeem this prize</p>
        </div>

        {/* Prize Details */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Prize</p>
            <p className="text-lg font-bold text-gray-900">{prize.prize_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Code</p>
            <p className="text-2xl font-mono font-bold text-[#005a32] tracking-wider">
              {prize.redemption_code}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Big Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="w-full py-5 bg-[#005a32] text-white rounded-lg hover:bg-[#004225] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg font-semibold shadow-sm"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Confirm Redemption
            </>
          )}
        </button>

        {/* Cancel link below */}
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          className="w-full mt-3 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
