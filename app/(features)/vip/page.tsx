'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import DashboardView from '@/components/vip/DashboardView';
import { useVipContext } from './contexts/VipContext';
import { getVipProfile, getVipBookings, getVipPackages } from '../../../lib/vipService'; // Adjusted path
import { VipProfileResponse, VipBooking, VipPackage, VipApiError } from '../../../types/vip'; // Adjusted path
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

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
  const { session, vipStatus, isLoadingVipStatus, vipStatusError, refetchVipStatus, sharedData, updateSharedData, isSharedDataFresh } = useVipContext();
  const router = useRouter();

  // Local state for dashboard-specific data
  const [profile, setProfile] = useState<VipProfileResponse | null>(null);
  const [nextBooking, setNextBooking] = useState<DashboardBooking | undefined>(undefined);
  const [primaryPackage, setPrimaryPackage] = useState<DashboardActivePackage | undefined>(undefined);
  
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!session || !vipStatus) return;

    // Use shared data if fresh and not forced to refresh
    if (!forceRefresh && isSharedDataFresh()) {
      setProfile(sharedData.profile);
      
      // Process next booking from shared data
      if (sharedData.recentBookings.length > 0) {
        const confirmedBooking = sharedData.recentBookings.find((b: VipBooking) => b.status === 'confirmed');
        if (confirmedBooking) {
          setNextBooking({
            id: confirmedBooking.id,
            date: confirmedBooking.date,
            time: confirmedBooking.startTime,
            duration: confirmedBooking.duration,
          });
        } else {
          setNextBooking(undefined);
        }
      } else {
        setNextBooking(undefined);
      }
      
      // Process primary package from shared data
      if (sharedData.activePackages.length > 0) {
        const firstActivePackage = sharedData.activePackages[0];
        let hrsRemaining: string | number | undefined;
        if (firstActivePackage.remainingHours !== undefined && firstActivePackage.remainingHours !== null) {
          hrsRemaining = firstActivePackage.remainingHours;
        } else if (firstActivePackage.remainingSessions !== undefined && firstActivePackage.remainingSessions !== null) {
          hrsRemaining = firstActivePackage.remainingSessions;
        } else {
          hrsRemaining = undefined;
        }

        setPrimaryPackage({
          id: firstActivePackage.id,
          name: firstActivePackage.package_display_name || firstActivePackage.packageName,
          hoursRemaining: hrsRemaining,
          expires: firstActivePackage.expiryDate ? new Date(firstActivePackage.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric'}) : undefined,
          tier: firstActivePackage.package_type_name?.includes('(') ? 
                firstActivePackage.package_type_name.substring(firstActivePackage.package_type_name.indexOf('(') + 1, firstActivePackage.package_type_name.indexOf(')')) : 
                (firstActivePackage.packageName?.includes('(') ? firstActivePackage.packageName.substring(firstActivePackage.packageName.indexOf('(') + 1, firstActivePackage.packageName.indexOf(')')) : undefined)
        });
      } else {
        setPrimaryPackage(undefined);
      }
      return;
    }

    setIsLoadingProfile(true);
    if (vipStatus.status === 'linked_matched' || vipStatus.status === 'linked_unmatched') {
      setIsLoadingBookings(true);
    }
    if (vipStatus.status === 'linked_matched') {
      setIsLoadingPackages(true);
    }
    setFetchError(null);

    try {
      // Fetch all data concurrently instead of sequentially
      const promises: Promise<any>[] = [getVipProfile()];
      
      if (vipStatus.status === 'linked_matched' || vipStatus.status === 'linked_unmatched') {
        promises.push(getVipBookings({ filter: 'future', limit: 5, page: 1 }));
      }
      
      if (vipStatus.status === 'linked_matched') {
        promises.push(getVipPackages());
      }

      const results = await Promise.allSettled(promises);
      
      // Process profile data
      if (results[0].status === 'fulfilled') {
        const profileData = results[0].value;
        setProfile(profileData);
        
        // Update shared data
        updateSharedData({ profile: profileData });
      } else {
        throw new Error('Failed to fetch profile data');
      }

      // Process bookings data
      if (promises.length > 1) {
        if (results[1].status === 'fulfilled') {
          const bookingsData = results[1].value;
          const bookings = bookingsData.bookings || [];
          
          // Update shared data with recent bookings
          updateSharedData({ recentBookings: bookings });
          
          let confirmedBooking: VipBooking | undefined = undefined;
          if (bookings.length > 0) {
            confirmedBooking = bookings.find((b: VipBooking) => b.status === 'confirmed');
          }

          let bookingObj: DashboardBooking | undefined = undefined;
          if (confirmedBooking) {
            bookingObj = {
              id: confirmedBooking.id,
              date: confirmedBooking.date,
              time: confirmedBooking.startTime,
              duration: confirmedBooking.duration,
            };
          }
          setNextBooking(bookingObj);
        } else {
          // Don't fail the entire fetch if bookings fail
          setNextBooking(undefined);
        }
      }
      
      // Process packages data  
      if (promises.length > 2) {
        if (results[2].status === 'fulfilled') {
          const packagesData = results[2].value;
          
          // Update shared data with packages
          updateSharedData({ 
            activePackages: packagesData.activePackages || [],
            pastPackages: packagesData.pastPackages || []
          });
          
          let packageObj: DashboardActivePackage | undefined = undefined;
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

            packageObj = {
              id: firstActivePackage.id,
              name: firstActivePackage.package_display_name || firstActivePackage.packageName,
              hoursRemaining: hrsRemaining,
              expires: firstActivePackage.expiryDate ? new Date(firstActivePackage.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric'}) : undefined,
              tier: firstActivePackage.package_type_name?.includes('(') ? 
                    firstActivePackage.package_type_name.substring(firstActivePackage.package_type_name.indexOf('(') + 1, firstActivePackage.package_type_name.indexOf(')')) : 
                    (firstActivePackage.packageName?.includes('(') ? firstActivePackage.packageName.substring(firstActivePackage.packageName.indexOf('(') + 1, firstActivePackage.packageName.indexOf(')')) : undefined)
            };
          }
          setPrimaryPackage(packageObj);
        } else {
          // Don't fail the entire fetch if packages fail
          setPrimaryPackage(undefined);
        }
      } else {
        // For non-matched users, clear booking and package data
        setNextBooking(undefined);
        setPrimaryPackage(undefined);
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
      if (vipStatus.status === 'linked_matched' || vipStatus.status === 'linked_unmatched') {
        setIsLoadingBookings(false);
      }
      if (vipStatus.status === 'linked_matched') {
        setIsLoadingPackages(false);
      }
    }
  }, [session, vipStatus, isSharedDataFresh, sharedData, updateSharedData]);

  useEffect(() => {
    const handleRetryEvent = () => {
      fetchData(true); // force refresh on manual retry
    };
    document.addEventListener('fetchDashboardData', handleRetryEvent);

    // Only fetch data if we have valid session and VIP status
    if (session && vipStatus && !isLoadingVipStatus && !vipStatusError) {
      fetchData();
    }

    return () => {
      document.removeEventListener('fetchDashboardData', handleRetryEvent);
    };
  }, [fetchData, session, vipStatus, isLoadingVipStatus, vipStatusError]);

  // Access control: Redirect users who need to complete account setup
  useEffect(() => {
    if (vipStatus?.status === 'not_linked') {
      router.replace('/vip/link-account');
    }
  }, [vipStatus?.status, router]);

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

  if (vipStatus?.status === 'not_linked') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <p className="text-muted-foreground">Redirecting to account setup...</p>
      </div>
    );
  }

  const isFetchingDashboardDetails = isLoadingProfile || 
    ((vipStatus.status === 'linked_matched' || vipStatus.status === 'linked_unmatched') && isLoadingBookings) ||
    (vipStatus.status === 'linked_matched' && isLoadingPackages);

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