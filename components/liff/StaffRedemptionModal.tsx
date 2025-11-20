'use client';

import { useState } from 'react';

interface Prize {
  id: string;
  prize_name: string;
  prize_description: string;
  redemption_code: string;
}

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
          <div className="w-16 h-16 bg-[#f5fef9] rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎁</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            Ready to Redeem Prize?
          </h3>
        </div>

        {/* Prize Details */}
        <div className="bg-[#f5fef9] border border-[#005a32]/20 rounded-lg p-4 mb-6">
          <div className="mb-3">
            <p className="text-sm text-gray-600">Prize:</p>
            <p className="text-lg font-bold text-gray-900">{prize.prize_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Redemption Code:</p>
            <p className="text-xl font-mono font-bold text-[#005a32] tracking-wide">
              {prize.redemption_code}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Info Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-6">
          <p className="text-sm text-blue-800 text-center">
            <strong>Staff:</strong> Click confirm below to redeem this prize
          </p>
        </div>

        {/* Big Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="w-full py-6 bg-[#005a32] text-white rounded-lg hover:bg-[#004225] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-xl font-bold shadow-lg"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Redeeming...
            </>
          ) : (
            <>
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              ✓ CONFIRM REDEEM
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
