'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
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

  // Add refs for caching
  const profileCache = useRef<VipProfileResponse | null>(null);
  const nextBookingCache = useRef<DashboardBooking | undefined>(undefined);
  const primaryPackageCache = useRef<DashboardActivePackage | undefined>(undefined);

  const [profile, setProfile] = useState<VipProfileResponse | null>(null);
  const [nextBooking, setNextBooking] = useState<DashboardBooking | undefined>(undefined);
  const [primaryPackage, setPrimaryPackage] = useState<DashboardActivePackage | undefined>(undefined);
  
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (session && vipStatus) {
      // Use cache unless forceRefresh is true
      if (!forceRefresh && profileCache.current && nextBookingCache.current !== undefined && primaryPackageCache.current !== undefined) {
        setProfile(profileCache.current);
        setNextBooking(nextBookingCache.current);
        setPrimaryPackage(primaryPackageCache.current);
        return;
      }
      setIsLoadingProfile(true);
      if (vipStatus.status === 'linked_matched') {
          setIsLoadingBookings(true);
          setIsLoadingPackages(true);
      }
      setFetchError(null);
      try {
        const profileData = await getVipProfile();
        setProfile(profileData);
        profileCache.current = profileData;

        if (vipStatus.status === 'linked_matched') {
          const bookingsData = await getVipBookings({ filter: 'future', limit: 5, page: 1 }); // Fetch a few to find a confirmed one
          let confirmedBooking: VipBooking | undefined = undefined;
          if (bookingsData.bookings && bookingsData.bookings.length > 0) {
            confirmedBooking = bookingsData.bookings.find(b => b.status === 'confirmed');
          }

          if (confirmedBooking) {
            const bookingObj = {
              id: confirmedBooking.id,
              date: confirmedBooking.date,
              time: confirmedBooking.startTime,
              duration: confirmedBooking.duration,
            };
            setNextBooking(bookingObj);
            nextBookingCache.current = bookingObj;
          } else {
            setNextBooking(undefined);
            nextBookingCache.current = undefined;
          }
          
          const packagesData = await getVipPackages();
          if (packagesData.activePackages && packagesData.activePackages.length > 0) {
            const firstActivePackage = packagesData.activePackages[0];
            
            let hrsRemaining: string | number | undefined;
            if (firstActivePackage.remainingHours !== undefined && firstActivePackage.remainingHours !== null) {
              hrsRemaining = firstActivePackage.remainingHours;
            } else if (firstActivePackage.remainingSessions !== undefined && firstActivePackage.remainingSessions !== null) {
              hrsRemaining = firstActivePackage.remainingSessions;
            } else {
              hrsRemaining = undefined;
            }

            const packageObj = {
              id: firstActivePackage.id,
              name: firstActivePackage.package_display_name || firstActivePackage.packageName,
              hoursRemaining: hrsRemaining,
              expires: firstActivePackage.expiryDate ? new Date(firstActivePackage.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric'}) : undefined,
              tier: firstActivePackage.package_type_name?.includes('(') ? 
                    firstActivePackage.package_type_name.substring(firstActivePackage.package_type_name.indexOf('(') + 1, firstActivePackage.package_type_name.indexOf(')')) : 
                    (firstActivePackage.packageName?.includes('(') ? firstActivePackage.packageName.substring(firstActivePackage.packageName.indexOf('(') + 1, firstActivePackage.packageName.indexOf(')')) : undefined)
            };
            setPrimaryPackage(packageObj);
            primaryPackageCache.current = packageObj;
          } else {
            setPrimaryPackage(undefined);
            primaryPackageCache.current = undefined;
          }
        }
      } catch (error) {
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
        fetchData(true); // force refresh on manual retry
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