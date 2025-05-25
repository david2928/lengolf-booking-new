'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BookingsList from '../../../../components/vip/BookingsList';
import { useVipContext } from '../contexts/VipContext';
import { Loader2 } from 'lucide-react';
import BookingModifyModal from '../../../../components/vip/BookingModifyModal';
import BookingCancelModal from '../../../../components/vip/BookingCancelModal';
import { getVipBookings } from '../../../../lib/vipService';
import type { VipBooking } from '../../../../types/vip';

// Placeholder for Modal components to be added in VIP-FE-007 and VIP-FE-008
// import ModifyBookingModal from '../../../../components/vip/BookingModifyModal';
// import CancelBookingModal from '../../../../components/vip/BookingCancelModal';

const VipBookingsPage = () => {
  const { vipStatus, isLoadingVipStatus, session, refetchVipStatus } = useVipContext();
  const router = useRouter();
  
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<VipBooking | undefined>(undefined);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Redirect unlinked users to link-account page
  useEffect(() => {
    if (!isLoadingVipStatus && vipStatus && (
      vipStatus.status === 'not_linked' || 
      vipStatus.status === 'linked_unmatched' ||
      vipStatus.status === 'vip_data_exists_crm_unmatched'
    )) {
      router.replace('/vip/link-account');
    }
  }, [vipStatus, isLoadingVipStatus, router]);

  const handleOpenModifyModal = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsModifyModalOpen(true);
    // console.log(`Request to modify booking: ${bookingId}`); // For testing
  };

  const handleOpenCancelModal = async (bookingId: string) => {
    setSelectedBookingId(bookingId);
    
    // Fetch booking details for the cancel modal
    try {
      const bookingsData = await getVipBookings({ filter: 'all', limit: 100 }); // Get all bookings to find the one we need
      const booking = bookingsData.bookings.find(b => b.id === bookingId);
      setSelectedBooking(booking);
    } catch (error) {
      console.error('Failed to fetch booking details for cancel modal:', error);
      setSelectedBooking(undefined);
    }
    
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
    setSelectedBooking(undefined);
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

  // Show loading while redirecting
  if (vipStatus && vipStatus.status !== 'linked_matched') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Redirecting to account linking...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>
        <p className="text-muted-foreground">View and manage your past and upcoming tee times.</p>
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
          booking={selectedBooking}
          isOpen={isCancelModalOpen}
          onClose={handleCloseCancelModal}
          onBookingCancelled={handleBookingCancelled}
        />
      )}
    </div>
  );
};

export default VipBookingsPage; 