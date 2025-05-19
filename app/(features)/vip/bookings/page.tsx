'use client';

import React, { useState, useCallback } from 'react';
import BookingsList from '../../../../components/vip/BookingsList';
import { useVipContext } from '../contexts/VipContext';
import { Loader2 } from 'lucide-react';
import BookingModifyModal from '../../../../components/vip/BookingModifyModal';
import BookingCancelModal from '../../../../components/vip/BookingCancelModal';

// Placeholder for Modal components to be added in VIP-FE-007 and VIP-FE-008
// import ModifyBookingModal from '../../../../components/vip/BookingModifyModal';
// import CancelBookingModal from '../../../../components/vip/BookingCancelModal';

const VipBookingsPage = () => {
  const { vipStatus, isLoadingVipStatus, session, refetchVipStatus } = useVipContext();
  
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const handleOpenModifyModal = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsModifyModalOpen(true);
    // console.log(`Request to modify booking: ${bookingId}`); // For testing
  };

  const handleOpenCancelModal = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsCancelModalOpen(true);
    // console.log(`Request to cancel booking: ${bookingId}`); // For testing
  };

  const handleCloseModifyModal = useCallback(() => {
    setIsModifyModalOpen(false);
    setSelectedBookingId(null);
  }, []);

  const handleCloseCancelModal = useCallback(() => {
    setIsCancelModalOpen(false);
    setSelectedBookingId(null);
  }, []);

  const handleBookingModifiedAndRedirect = useCallback(async () => {
    handleCloseModifyModal();
    if (refetchVipStatus) {
        await refetchVipStatus();
    }
    // Modal handles actual redirect to /bookings
    // List on this page doesn't strictly need refresh if we are navigating away,
    // but a general status refresh might be good.
  }, [handleCloseModifyModal, refetchVipStatus]);

  const handleBookingCancelled = useCallback(async () => {
    handleCloseCancelModal();
    setRefreshNonce(prev => prev + 1);
    if (refetchVipStatus) {
        await refetchVipStatus();
    }
    // Optionally show a success toast/message here
  }, [handleCloseCancelModal, refetchVipStatus]);

  if (isLoadingVipStatus || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading bookings information...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-800 tracking-tight">My Bookings</h1>
        <p className="text-lg text-muted-foreground mt-1">View and manage your past and upcoming tee times.</p>
      </div>
      
      <BookingsList 
        onModifyBooking={handleOpenModifyModal}
        onCancelBooking={handleOpenCancelModal}
        refreshNonce={refreshNonce}
      />

      {isModifyModalOpen && selectedBookingId && (
        <BookingModifyModal
          bookingId={selectedBookingId}
          isOpen={isModifyModalOpen}
          onClose={handleCloseModifyModal}
          onBookingCancelledAndRedirect={handleBookingModifiedAndRedirect}
        />
      )}

      {isCancelModalOpen && selectedBookingId && (
        <BookingCancelModal
          bookingId={selectedBookingId}
          isOpen={isCancelModalOpen}
          onClose={handleCloseCancelModal}
          onBookingCancelled={handleBookingCancelled}
        />
      )}
    </div>
  );
};

export default VipBookingsPage; 