'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

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
  const [vipProfile, setVipProfile] = useState<VipProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

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
  }, [session?.user?.id]);

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
        const response = await fetch('/api/vip/profile');
        if (!response.ok) {
          let errorMsg = `Error fetching VIP profile: ${response.status} ${response.statusText}`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch (e) {
            // Ignore if response is not JSON
          }
          throw new Error(errorMsg);
        }
        const data = await response.json();
        setVipProfile(data);
        
        // Update cache
        vipProfileCache.current = {
          profile: data,
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
    fetchVipProfile();
  }, [fetchVipProfile]);

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