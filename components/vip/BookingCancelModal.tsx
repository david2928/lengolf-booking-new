'use client';

import React, { useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cancelVipBooking } from '../../lib/vipService';
import { VipApiError, VipBooking } from '../../types/vip';
import { Loader2, AlertTriangle, ShieldAlert, CheckCircle, Calendar, Clock, Users } from 'lucide-react';

interface BookingCancelModalProps {
  bookingId: string;
  booking?: VipBooking; // Optional booking details for display
  isOpen: boolean;
  onClose: () => void;
  onBookingCancelled: () => void; // Callback after successful cancellation
}

const BookingCancelModal: React.FC<BookingCancelModalProps> = ({
  bookingId,
  booking,
  isOpen,
  onClose,
  onBookingCancelled
}) => {
  const t = useTranslations('vip.bookings');
  const formatter = useFormatter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleConfirmCancel = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await cancelVipBooking(bookingId, cancellationReason.trim() ? { cancellation_reason: cancellationReason.trim() } : undefined);
      setIsSuccess(true); // Show success state - user must manually close

      // Immediately notify parent that cancellation succeeded (for optimistic updates and refresh)
      onBookingCancelled();
    } catch (e: unknown) {
      let errorMessage = t('cancelErrorDefault');
      if (e instanceof VipApiError) {
        errorMessage = e.payload?.message || e.message || errorMessage;
      } else if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      } else if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
        errorMessage = e.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // When the dialog's open state changes externally or when DialogClose is clicked,
  // we should also clear local error state.
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // No need to call onBookingCancelled here anymore - it's called immediately on success
      onClose();
      setError(null); // Clear error when modal is closed
      setIsLoading(false); // Reset loading state
      setCancellationReason(''); // Clear reason when modal is closed
      setIsSuccess(false); // Reset success state
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return formatter.dateTime(date, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Format time for display. timeStr is an Asia/Bangkok wall-clock "HH:mm"
  // value, so we anchor today's date in Bangkok and let the formatter render
  // the locale's conventional short time (12h in en, 24h in ja/ko, etc.).
  const formatTime = (timeStr: string) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const date = new Date(`${today}T${timeStr}:00+07:00`);
      return formatter.dateTime(date, {
        timeZone: 'Asia/Bangkok',
        timeStyle: 'short',
      });
    } catch {
      return timeStr;
    }
  };

  if (isSuccess) {
    // Success state - show cancellation confirmation
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CheckCircle className="h-6 w-6 mr-2 text-green-600 flex-shrink-0" />
              {t('cancelSuccessTitle')}
            </DialogTitle>
            <DialogDescription className="mt-2">
              {t('cancelSuccessBody')}
            </DialogDescription>
          </DialogHeader>

          {booking && (
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <h4 className="font-medium text-gray-800 mb-2">{t('cancelledBooking')}</h4>

              <div className="space-y-2 text-sm">
                <div className="flex items-center text-gray-700">
                  <Calendar className="h-4 w-4 mr-2 text-gray-500 flex-shrink-0" />
                  <span>{formatDate(booking.date)}</span>
                </div>

                <div className="flex items-center text-gray-700">
                  <Clock className="h-4 w-4 mr-2 text-gray-500 flex-shrink-0" />
                  <span>{formatTime(booking.startTime)}</span>
                </div>

                <div className="flex items-center text-gray-700">
                  <Clock className="h-4 w-4 mr-2 text-gray-500 flex-shrink-0" />
                  <span>{t('durationValue', { hours: booking.duration })}</span>
                </div>

                <div className="flex items-center text-gray-700">
                  <Users className="h-4 w-4 mr-2 text-gray-500 flex-shrink-0" />
                  <span>{t('personValue', { count: booking.numberOfPeople })}</span>
                </div>
              </div>

              {cancellationReason && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-700">
                    {t('reasonLabel', { reason: cancellationReason })}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0" />
              <p className="text-sm text-green-800">
                <strong>{t('cancelSuccessEmailStrong')}</strong> - {t('cancelSuccessEmailBody')}
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button className="w-full" onClick={() => {
              // Parent was already notified when cancellation succeeded
              onClose();
            }}>
              {t('done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Default state - show cancellation form
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <ShieldAlert className="h-6 w-6 mr-2 text-destructive flex-shrink-0" />
            {t('cancelConfirmTitle')}
          </DialogTitle>
          <DialogDescription className="mt-2">
            {t('cancelConfirmBody')}
          </DialogDescription>
        </DialogHeader>

        {/* Show booking details in confirmation if available */}
        {booking && (
          <div className="bg-gray-50 p-3 rounded-lg space-y-2 text-sm">
            <h4 className="font-medium text-gray-800 mb-2">{t('bookingToCancel')}</h4>
            <div className="flex items-center text-gray-600">
              <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>{t('dateAtTime', { date: formatDate(booking.date), time: formatTime(booking.startTime) })}</span>
            </div>
            <div className="flex items-center text-gray-600">
              <Users className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>{t('pillPersonDuration', { count: booking.numberOfPeople, hours: booking.duration })}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="my-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="cancellation-reason" className="block text-sm font-medium text-gray-700 mb-1">
              {t('reasonFieldLabel')}
            </label>
            <textarea
              id="cancellation-reason"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
              className="w-full p-2 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              maxLength={500}
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">{t('charCount', { count: cancellationReason.length })}</p>
          </div>
        </div>

        <DialogFooter className="mt-6 sm:flex-col sm:space-y-2">
          <Button
            variant="destructive"
            onClick={handleConfirmCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('confirming')}</>
            ) : (
              t('yesCancel')
            )}
          </Button>
          <DialogClose asChild>
            <Button variant="outline" onClick={() => {/* onOpenChange handles error reset */}} className="w-full sm:w-auto">
              {t('keepBooking')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingCancelModal; 