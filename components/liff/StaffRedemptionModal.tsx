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
  const [staffName, setStaffName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !prize) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!staffName.trim()) {
      setError('Please enter staff name');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await onConfirm(staffName.trim());
      // Success handled by parent component
      setStaffName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to redeem prize');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setStaffName('');
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
            <p className="text-lg font-mono font-bold text-[#005a32] tracking-wide">
              {prize.redemption_code}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="staffName" className="block text-sm font-medium text-gray-700 mb-2">
              Staff Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="staffName"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Enter your name"
              disabled={isSubmitting}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#005a32] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          {/* Info Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-6">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> The customer will show this screen to you for redemption confirmation.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !staffName.trim()}
              className="flex-1 px-4 py-2 bg-[#005a32] text-white rounded-md hover:bg-[#004225] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Redeeming...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Confirm Redeem
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
