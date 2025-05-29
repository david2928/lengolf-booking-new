'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { Session } from 'next-auth';
import { VipStatusResponse, VipProfileResponse, VipBooking, VipPackage } from '../../../../types/vip'; // Adjusted path

export interface VipSharedData {
  profile: VipProfileResponse | null;
  recentBookings: VipBooking[];
  activePackages: VipPackage[];
  pastPackages: VipPackage[];
  lastDataFetch: number | null;
}

export interface VipContextType {
  session: Session | null;
  vipStatus: VipStatusResponse | null;
  isLoadingVipStatus: boolean;
  vipStatusError: Error | null;
  refetchVipStatus?: () => Promise<void>; // Optional: to allow refetching status
  
  // Shared data to reduce redundant API calls
  sharedData: VipSharedData;
  updateSharedData: (data: Partial<VipSharedData>) => void;
  isSharedDataFresh: (maxAgeMs?: number) => boolean;
}

const VipContext = createContext<VipContextType | undefined>(undefined);

export const useVipContext = () => {
  const context = useContext(VipContext);
  if (context === undefined) {
    throw new Error('useVipContext must be used within a VipContextProvider');
  }
  return context;
};

interface VipContextProviderProps {
  children: ReactNode;
  value: VipContextType;
}

export const VipContextProvider: React.FC<VipContextProviderProps> = ({ children, value }) => {
  return <VipContext.Provider value={value}>{children}</VipContext.Provider>;
}; 