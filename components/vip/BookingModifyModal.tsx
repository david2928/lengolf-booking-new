'use client';

import React, { useState } from 'react';
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
import { VipApiError } from '../../types/vip';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle } from 'lucide-react';

interface BookingModifyModalProps {
  bookingId: string;
  isOpen: boolean;
  onClose: () => void;
  onBookingCancelledAndRedirect: () => void; // Callback after successful cancel & redirect logic
}

const BookingModifyModal: React.FC<BookingModifyModalProps> = ({
  bookingId,
  isOpen,
  onClose,
  onBookingCancelledAndRedirect
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleConfirmModify = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await cancelVipBooking(bookingId);
      // Call the parent's redirect function which also handles UI updates (e.g., refetching bookings)
      onBookingCancelledAndRedirect();
      router.push('/bookings'); // Redirect to the main booking page to rebook
      onClose(); // Close the modal
    } catch (e: any) {
      console.error('Failed to cancel booking for modification:', e);
      let errorMessage = 'Could not cancel the booking. Please try again.';
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

  // When the dialog's open state changes externally (e.g. parent sets isOpen to false)
  // or when DialogClose is clicked, we should also clear local error state.
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      setError(null); // Clear error when modal is closed
      setIsLoading(false); // Reset loading state
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modify Booking</DialogTitle>
          <DialogDescription className="mt-2">
            To modify this booking, you'll first need to cancel it. You will then be redirected to make a new booking with your desired changes.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="my-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <DialogFooter className="mt-6 sm:flex-col sm:space-y-2">
          <Button 
            variant="default"
            onClick={handleConfirmModify} 
            disabled={isLoading} 
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling...</>
            ) : (
              'Cancel & Rebook'
            )}
          </Button>
          <DialogClose asChild>
            <Button variant="outline" onClick={() => {/* onOpenChange handles error reset */}} className="w-full sm:w-auto">
              Keep Booking
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingModifyModal; 