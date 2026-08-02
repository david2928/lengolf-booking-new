'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import BookingsList from '@/components/vip/BookingsList';
import { useVipContext } from '../contexts/VipContext';
import { Loader2 } from 'lucide-react';
import BookingModifyModal from '@/components/vip/BookingModifyModal';
import BookingCancelModal from '@/components/vip/BookingCancelModal';
import { getVipBookings } from '@/lib/vipService';
import type { ModifyVipBookingChanges, VipBooking } from '@/types/vip';

// Placeholder for Modal components to be added in VIP-FE-007 and VIP-FE-008
// import ModifyBookingModal from '../../../../components/vip/BookingModifyModal';
// import CancelBookingModal from '../../../../components/vip/BookingCancelModal';

const VipBookingsPage = () => {
  const { vipStatus, isLoadingVipStatus, session } = useVipContext();
  const router = useRouter();
  const t = useTranslations('vip.bookings');
  const tCommon = useTranslations('vip.common');
  
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

  // The edit modal needs the whole booking (date, time, duration, pax, bay) to
  // prefill its form, not just the id — same reason the cancel modal fetches.
  const handleOpenModifyModal = async (bookingId: string) => {
    setSelectedBookingId(bookingId);

    try {
      const bookingsData = await getVipBookings({ filter: 'all', limit: 100 });
      setSelectedBooking(bookingsData.bookings.find(b => b.id === bookingId));
    } catch (error) {
      console.error('Failed to fetch booking details for edit modal:', error);
      setSelectedBooking(undefined);
    }

    setIsModifyModalOpen(true);
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
    setSelectedBooking(undefined);
  }, []);

  const handleCloseCancelModal = useCallback(() => {
    setIsCancelModalOpen(false);
    setSelectedBookingId(null);
    setSelectedBooking(undefined);
  }, []);

  /**
   * The edit succeeded. No redirect any more — the booking still exists, so the
   * customer stays on the list and watches their card update.
   *
   * The modal keeps itself open to show its success state; this only patches the
   * list underneath it and asks for fresh data, exactly like the cancel flow.
   */
  const handleBookingModified = useCallback(
    (bookingId: string, changes: ModifyVipBookingChanges) => {
      const patch: Partial<VipBooking> = {};
      if (changes.date) patch.date = changes.date.to;
      if (changes.start_time) patch.startTime = changes.start_time.to;
      if (changes.duration) patch.duration = changes.duration.to;
      if (changes.number_of_people && changes.number_of_people.to !== null) {
        patch.numberOfPeople = changes.number_of_people.to;
      }
      if (changes.customer_notes) patch.notes = changes.customer_notes.to ?? undefined;

      if (Object.keys(patch).length > 0) {
        setOptimisticUpdates(prev => ({ ...prev, [bookingId]: patch }));
      }
      setRefreshNonce(prev => prev + 1);
    },
    []
  );

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
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  // Show loading while redirecting (only for users who actually need to be redirected)
  if (vipStatus && (vipStatus.status === 'not_linked' || vipStatus.status === 'vip_data_exists_crm_unmatched')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{tCommon('redirectingToAccountLinking')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('heading')}</h1>
        <p className="text-muted-foreground">{t('subheading')}</p>
      </div>
      
      <BookingsList 
        onModifyBooking={handleOpenModifyModal}
        onCancelBooking={handleOpenCancelModal}
        refreshNonce={refreshNonce}
        optimisticUpdates={optimisticUpdates}
      />

      {isModifyModalOpen && selectedBooking && (
        <BookingModifyModal
          booking={selectedBooking}
          isOpen={isModifyModalOpen}
          onClose={handleCloseModifyModal}
          onBookingModified={handleBookingModified}
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