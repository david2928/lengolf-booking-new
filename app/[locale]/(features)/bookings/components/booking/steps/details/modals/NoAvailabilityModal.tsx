'use client';

import { useTranslations } from 'next-intl';
import { ClockIcon } from '@heroicons/react/24/outline';

interface NoAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
}

export function NoAvailabilityModal({ isOpen, onClose, onBack }: NoAvailabilityModalProps) {
  const t = useTranslations('bookings.detailsStep');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <ClockIcon className="h-6 w-6 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t('noAvailabilityTitle')}
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            {t('noAvailabilityBody')}
          </p>
          <button
            onClick={() => {
              onClose();
              onBack();
            }}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
          >
            {t('noAvailabilityCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
