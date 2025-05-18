'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardView from '@/components/vip/DashboardView';
import { useVipContext } from './contexts/VipContext';
import { getVipProfile, getVipBookings, getVipPackages } from '../../../lib/vipService'; // Adjusted path
import { VipProfileResponse, VipBooking, VipPackage, VipApiError } from '../../../types/vip'; // Adjusted path
import { Button } from '@/components/ui/button';

// Define the local Booking type for DashboardView prop matching
interface DashboardBooking {
  id: string;
  date: string; // This will be formatted string by the page
  time: string; // This will be formatted string by the page
  duration?: number; // Duration in hours
}

// Define the local ActivePackage type for DashboardView prop matching
interface DashboardActivePackage {
  id: string;
  name: string;
  tier?: string;
  hoursRemaining?: string | number;
  expires?: string;
}

const VipDashboardPage = () => {
  const { session, vipStatus, isLoadingVipStatus, vipStatusError, refetchVipStatus } = useVipContext();

  const [profile, setProfile] = useState<VipProfileResponse | null>(null);
  const [nextBooking, setNextBooking] = useState<DashboardBooking | undefined>(undefined);
  const [primaryPackage, setPrimaryPackage] = useState<DashboardActivePackage | undefined>(undefined);
  
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (session && vipStatus) {
      setIsLoadingProfile(true);
      if (vipStatus.status === 'linked_matched') {
          setIsLoadingBookings(true);
          setIsLoadingPackages(true);
      }
      setFetchError(null);
      try {
        const profileData = await getVipProfile();
        setProfile(profileData);

        if (vipStatus.status === 'linked_matched') {
          const bookingsData = await getVipBookings({ filter: 'future', limit: 1, page: 1 });
          if (bookingsData.bookings && bookingsData.bookings.length > 0) {
            const booking = bookingsData.bookings[0];
            setNextBooking({
              id: booking.id,
              date: booking.date,
              time: booking.startTime,
              duration: booking.duration,
            });
          } else {
            setNextBooking(undefined);
          }
          
          const packagesData = await getVipPackages();
          if (packagesData.activePackages && packagesData.activePackages.length > 0) {
            const firstActivePackage = packagesData.activePackages[0];
            setPrimaryPackage({
              id: firstActivePackage.id,
              name: firstActivePackage.packageName,
              hoursRemaining: firstActivePackage.remainingSessions,
              expires: firstActivePackage.expiryDate ? new Date(firstActivePackage.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric'}) : undefined,
            });
          } else {
            setPrimaryPackage(undefined);
          }
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        if (error instanceof VipApiError) {
          setFetchError(error.payload?.message || error.message);
        } else if (error instanceof Error) {
          setFetchError(error.message);
        } else {
          setFetchError('An unknown error occurred during data fetch.');
        }
      } finally {
        setIsLoadingProfile(false);
        if (vipStatus.status === 'linked_matched') {
            setIsLoadingBookings(false);
            setIsLoadingPackages(false);
        }
      }
    }
  }, [session, vipStatus]);

  useEffect(() => {
    const handleRetryEvent = () => {
        fetchData();
    };
    document.addEventListener('fetchDashboardData', handleRetryEvent);

    if (session && vipStatus && !isLoadingVipStatus && !vipStatusError) {
        fetchData();
    }

    return () => {
        document.removeEventListener('fetchDashboardData', handleRetryEvent);
    };
  }, [fetchData, session, vipStatus, isLoadingVipStatus, vipStatusError]);


  if (isLoadingVipStatus || (!vipStatus && !vipStatusError)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-muted-foreground">Loading VIP Dashboard Status...</p>
      </div>
    );
  }

  if (vipStatusError) {
    return (
      <div className="text-center py-10">
        <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading VIP Status</h2>
        <p className="text-muted-foreground mb-4">Could not determine your VIP account status.</p>
        {(vipStatusError instanceof VipApiError && vipStatusError.payload?.message) && <p className="text-sm text-red-500 mb-2">Details: {vipStatusError.payload.message}</p>}
        {!(vipStatusError instanceof VipApiError) && <p className="text-sm text-red-500 mb-2">Details: {vipStatusError.message}</p>}
        {refetchVipStatus && <Button onClick={refetchVipStatus}>Try Again (Status)</Button>}
      </div>
    );
  }
  
  if (!vipStatus || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <p className="text-muted-foreground">Initializing session or VIP status...</p>
      </div>
    );
  }

  const isFetchingDashboardDetails = isLoadingProfile || (vipStatus.status === 'linked_matched' && (isLoadingBookings || isLoadingPackages));

  if (isFetchingDashboardDetails && !fetchError) {
    return (
     <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
       <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
       <p className="text-muted-foreground">Loading dashboard details...</p>
     </div>
   );
 }


  if (fetchError) {
    return (
      <div className="text-center py-10">
        <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Dashboard Data</h2>
        <p className="text-muted-foreground mb-4">{fetchError}</p>
        <Button onClick={() => {
            setFetchError(null); 
            document.dispatchEvent(new Event('fetchDashboardData'));
        }}>Try Again (Data)</Button>
      </div>
    );
  }
  
  const isMatched = vipStatus.status === 'linked_matched';
  const userName = profile?.name || session.user?.name || 'VIP Member';
  const vipTierName = profile?.vipTier?.name;

  return (
    <DashboardView 
      isMatched={isMatched}
      userName={userName}
      nextBooking={nextBooking} 
      primaryActivePackage={primaryPackage} 
      vipTier={vipTierName} 
    />
  );
};

export default VipDashboardPage; 