'use client';

import { useState } from 'react';
import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import { X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface Booking {
  id: string;
  date: string;
  startTime: string;
  duration: number;
  bay: string | null;
  status: string;
  numberOfPeople: number;
  notes?: string | null;
}

interface BookingCancelModalProps {
  booking: Booking;
  lineUserId: string;
  language: Language;
  isOpen: boolean;
  onClose: () => void;
  onBookingCancelled: () => void;
}

export default function BookingCancelModal({
  booking,
  lineUserId,
  language,
  isOpen,
  onClose,
  onBookingCancelled,
}: BookingCancelModalProps) {
  const t = membershipTranslations[language];
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Convert bay to type display
  const getBayTypeDisplay = (bay: string | null) => {
    if (!bay) return t.socialBay;
    const bayLower = bay.toLowerCase();
    if (bayLower.includes('ai') || bayLower === 'bay 4' || bayLower === 'bay_4') {
      return t.aiBay;
    }
    return t.socialBay;
  };

  const handleCancel = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/liff/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lineUserId,
          cancellation_reason: cancellationReason.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel booking');
      }

      setIsSuccess(true);
      onBookingCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel booking');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setCancellationReason('');
    setIsSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  // Success state
  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t.bookingCancelled}</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            <p className="text-gray-600 mb-4">{t.bookingCancelledDescription}</p>

            {/* Cancelled booking details */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t.on}</span>
                <span className="font-medium text-gray-900">{formatDate(booking.date)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t.at}</span>
                <span className="font-medium text-gray-900">{booking.startTime}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t.hours}</span>
                <span className="font-medium text-gray-900">{booking.duration}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t.bay}</span>
                <span className="font-medium text-gray-900">{getBayTypeDisplay(booking.bay)}</span>
              </div>
            </div>

            {cancellationReason && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{t.cancellationReason}:</span> {cancellationReason}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={handleClose}
              className="w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              {t.done}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirmation state
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">{t.confirmCancellation}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            disabled={isLoading}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-gray-600 mb-4">{t.cancelConfirmMessage}</p>

          {/* Booking details */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t.on}</span>
              <span className="font-medium text-gray-900">{formatDate(booking.date)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t.at}</span>
              <span className="font-medium text-gray-900">{booking.startTime}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t.hours}</span>
              <span className="font-medium text-gray-900">{booking.duration}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t.people}</span>
              <span className="font-medium text-gray-900">{booking.numberOfPeople}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t.bay}</span>
              <span className="font-medium text-gray-900">{getBayTypeDisplay(booking.bay)}</span>
            </div>
          </div>

          {/* Cancellation reason */}
          <div className="mb-4">
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
              {t.cancellationReason}
            </label>
            <textarea
              id="reason"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder={t.cancellationReasonPlaceholder}
              className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-primary focus:border-primary"
              rows={3}
              maxLength={500}
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1 text-right">{cancellationReason.length}/500</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="w-full py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t.cancelling}
              </>
            ) : (
              t.yesCancelBooking
            )}
          </button>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {t.keepBooking}
          </button>
        </div>
      </div>
    </div>
  );
}
