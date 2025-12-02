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
    <div className="fixed inset-0 z-50 flex flex-col bg-white animate-in fade-in duration-200">
      {/* Close Button */}
      <button
        onClick={handleClose}
        disabled={isSubmitting}
        className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50 shadow-md"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Large Prize Image - Takes up most of the screen */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-amber-50 to-white p-8">
        {prize.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={prize.image_url}
            alt={prize.prize_name}
            className="max-w-full max-h-full object-contain drop-shadow-lg"
            style={{ maxHeight: '50vh' }}
          />
        ) : (
          <div className="w-48 h-48 bg-amber-100 rounded-full flex items-center justify-center border-4 border-amber-200">
            <svg className="w-24 h-24 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>
        )}
      </div>

      {/* Bottom Section with Prize Info and Actions */}
      <div className="bg-white border-t border-gray-200 p-6 pb-safe">
        {/* Prize Name & Description */}
        <h3 className="text-2xl font-bold text-gray-900 text-center mb-1">
          {prize.prize_name}
        </h3>
        {prize.prize_description && (
          <p className="text-sm text-gray-500 text-center mb-4">
            {prize.prize_description}
          </p>
        )}

        {/* Redemption Code */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-center">
          <p className="text-xs text-amber-600 uppercase tracking-wide mb-1">Redemption Code</p>
          <p className="text-3xl font-mono font-bold text-amber-700 tracking-wider">
            {prize.redemption_code}
          </p>
        </div>

        {/* Clear Redemption Instructions */}
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 mb-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-sm font-bold text-green-800 uppercase">For Staff</p>
          </div>
          <p className="text-sm text-green-700 font-medium">
            Show this screen to LENGOLF staff to verify and collect your prize
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="w-full py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg font-bold shadow-lg"
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
              Staff: Confirm Redemption
            </>
          )}
        </button>

        {/* Cancel link */}
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          className="w-full mt-3 py-2 text-gray-400 text-sm hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
