'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { Session } from 'next-auth';
import { VipStatusResponse } from '../../../../types/vip'; // Adjusted path

export interface VipContextType {
  session: Session | null;
  vipStatus: VipStatusResponse | null;
  isLoadingVipStatus: boolean;
  vipStatusError: Error | null;
  refetchVipStatus?: () => Promise<void>; // Optional: to allow refetching status
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