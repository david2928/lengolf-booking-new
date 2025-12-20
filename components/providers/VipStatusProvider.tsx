'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

export interface VipTier {
  id: number;
  name: string;
  description: string | null;
}

export interface VipProfile {
  id: string;
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  pictureUrl: string | null;
  marketingPreference: boolean | null;
  crmStatus: 'not_linked' | 'linked_matched' | 'linked_unmatched' | 'error' | 'vip_data_exists_crm_unmatched' | null;
  crmCustomerId: string | null;
  stableHashId: string | null;
  vipTier: VipTier | null;
  // Additional computed properties for backward compatibility
  hasVipData?: boolean;
  isActive?: boolean;
  profileExists?: boolean;
}

interface VipStatusContextType {
  vipProfile: VipProfile | null;
  isLoading: boolean;
  error: Error | null;
  refetchVipProfile: () => void;
}

const VipStatusContext = createContext<VipStatusContextType | undefined>(undefined);

export function VipStatusProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  const [vipProfile, setVipProfile] = useState<VipProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Skip VIP status fetching on LIFF pages for better performance
  const isLiffPage = pathname?.startsWith('/liff');

  // Cache for VIP profile to prevent unnecessary API calls
  const vipProfileCache = useRef<{
    profile: VipProfile | null;
    lastFetchTime: number | null;
    sessionId: string | null; // Track session to detect user changes
  }>({
    profile: null,
    lastFetchTime: null,
    sessionId: null,
  });

  // Cache expiry time in milliseconds (3 minutes)
  const VIP_PROFILE_CACHE_EXPIRY_MS = 3 * 60 * 1000;

  const isVipProfileCacheValid = useCallback(() => {
    const cache = vipProfileCache.current;
    const currentTime = Date.now();
    const currentSessionId = session?.user?.id || null;
    
    // Cache is invalid if:
    // 1. No last fetch time
    // 2. Cache has expired
    // 3. Session user has changed
    if (!cache.lastFetchTime) return false;
    if (currentTime - cache.lastFetchTime > VIP_PROFILE_CACHE_EXPIRY_MS) return false;
    if (cache.sessionId !== currentSessionId) return false;
    
    return true;
  }, [session?.user?.id, VIP_PROFILE_CACHE_EXPIRY_MS]);

  const fetchVipProfile = useCallback(async (forceRefresh = false) => {
    if (sessionStatus === 'authenticated' && session?.user?.id) {
      // Use cache if valid and not forced to refresh
      if (!forceRefresh && isVipProfileCacheValid()) {
        const cachedProfile = vipProfileCache.current.profile;
        if (cachedProfile) {
          setVipProfile(cachedProfile);
          setIsLoading(false);
          setError(null);
          return;
        }
      }

      setIsLoading(true);
      setError(null);
      try {
        // First get VIP status to determine if user is linked
        const statusResponse = await fetch('/api/vip/status');
        if (!statusResponse.ok) {
          let errorMsg = `Error fetching VIP status: ${statusResponse.status} ${statusResponse.statusText}`;
          try {
            const errorData = await statusResponse.json();
            errorMsg = errorData.error || errorMsg;
          } catch {
            // Ignore if response is not JSON
          }
          throw new Error(errorMsg);
        }
        const statusData = await statusResponse.json();

        // Then get profile data for user details
        const profileResponse = await fetch('/api/vip/profile');
        if (!profileResponse.ok) {
          let errorMsg = `Error fetching VIP profile: ${profileResponse.status} ${profileResponse.statusText}`;
          try {
            const errorData = await profileResponse.json();
            errorMsg = errorData.error || errorMsg;
          } catch {
            // Ignore if response is not JSON
          }
          throw new Error(errorMsg);
        }
        const profileData = await profileResponse.json();

        // Transform the data to match VipProfile interface
        const transformedProfile: VipProfile = {
          id: profileData.id,
          name: profileData.name,
          email: profileData.email,
          phoneNumber: profileData.phoneNumber,
          pictureUrl: profileData.pictureUrl,
          marketingPreference: profileData.marketingPreference,
          crmStatus: statusData.status, // Use status from /api/vip/status
          crmCustomerId: statusData.crmCustomerId,
          stableHashId: null, // Deprecated field
          vipTier: profileData.vipTier,
          // Computed properties for backward compatibility
          hasVipData: statusData.status !== 'not_linked',
          isActive: statusData.status === 'linked_matched' || statusData.status === 'linked_unmatched',
          profileExists: true
        };

        setVipProfile(transformedProfile);
        
        // Update cache
        vipProfileCache.current = {
          profile: transformedProfile,
          lastFetchTime: Date.now(),
          sessionId: session.user.id,
        };
      } catch (err) {
        console.error('VipStatusProvider fetch error:', err);
        setError(err instanceof Error ? err : new Error('An unknown error occurred'));
        setVipProfile(null); // Clear profile on error
      } finally {
        setIsLoading(false);
      }
    } else if (sessionStatus === 'unauthenticated') {
      // Clear profile and cache if user logs out
      setVipProfile(null);
      setIsLoading(false);
      setError(null);
      vipProfileCache.current = {
        profile: null,
        lastFetchTime: null,
        sessionId: null,
      };
    }
    // If sessionStatus is 'loading', do nothing and wait for it to resolve.
  }, [sessionStatus, session?.user?.id, isVipProfileCacheValid]);

  useEffect(() => {
    if (isLiffPage) return; // Skip on LIFF pages
    fetchVipProfile();
  }, [fetchVipProfile, isLiffPage]);

  return (
    <VipStatusContext.Provider value={{ 
      vipProfile, 
      isLoading, 
      error, 
      refetchVipProfile: () => fetchVipProfile(true) // Force refresh when explicitly called
    }}>
      {children}
    </VipStatusContext.Provider>
  );
}

export function useVipStatus() {
  const context = useContext(VipStatusContext);
  if (context === undefined) {
    throw new Error('useVipStatus must be used within a VipStatusProvider');
  }
  return context;
} 