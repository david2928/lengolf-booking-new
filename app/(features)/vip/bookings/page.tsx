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
  const [optimisticUpdates, setOptimisticUpdates] = useState<{ [bookingId: string]: Partial<VipBooking> }>({});

  // Redirect unlinked users to link-account page
  // Note: linked_unmatched users can access bookings via their profile_id
  useEffect(() => {
    if (!isLoadingVipStatus && vipStatus && (
      vipStatus.status === 'not_linked' || 
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
    // DON'T close modal yet - let the success state show first
    
    // Apply optimistic update immediately and trigger single refresh
    if (selectedBookingId) {
      setOptimisticUpdates(prev => ({
        ...prev,
        [selectedBookingId]: { status: 'cancelled' }
      }));
      
      // Trigger single immediate refresh of booking data
      setRefreshNonce(prev => prev + 1);
    }
    
    // Clear optimistic updates after a short delay (data should be refreshed by then)
    setTimeout(() => {
      if (selectedBookingId) {
        setOptimisticUpdates(prev => {
          const { [selectedBookingId]: removed, ...rest } = prev;
          console.log('Removed booking:', removed);
          return rest;
        });
      }
    }, 1000);
    
    // Note: We don't call handleCloseCancelModal() here anymore
    // The modal will handle its own closing logic when user clicks "Done"
  }, [selectedBookingId]);

  // Clear optimistic updates when refreshNonce changes (actual data is refreshed)
  useEffect(() => {
    if (refreshNonce > 0) {
      setOptimisticUpdates({});
    }
  }, [refreshNonce]);

  if (isLoadingVipStatus || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading bookings information...</p>
      </div>
    );
  }

  // Show loading while redirecting (only for users who actually need to be redirected)
  if (vipStatus && (vipStatus.status === 'not_linked' || vipStatus.status === 'vip_data_exists_crm_unmatched')) {
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
        optimisticUpdates={optimisticUpdates}
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