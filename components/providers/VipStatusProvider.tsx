'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  const fetchVipProfile = async () => {
    if (sessionStatus === 'authenticated' && session?.user?.id) {
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
      } catch (err) {
        console.error('VipStatusProvider fetch error:', err);
        setError(err instanceof Error ? err : new Error('An unknown error occurred'));
        setVipProfile(null); // Clear profile on error
      } finally {
        setIsLoading(false);
      }
    } else if (sessionStatus === 'unauthenticated') {
      // Clear profile if user logs out
      setVipProfile(null);
      setIsLoading(false);
      setError(null);
    }
    // If sessionStatus is 'loading', do nothing and wait for it to resolve.
  };

  useEffect(() => {
    fetchVipProfile();
  }, [sessionStatus, session?.user?.id]);

  return (
    <VipStatusContext.Provider value={{ vipProfile, isLoading, error, refetchVipProfile: fetchVipProfile }}>
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