'use client';

import { SessionProvider } from 'next-auth/react';
import { VipStatusProvider } from '@/components/providers/VipStatusProvider';
// import { GtmUserProfileProvider } from '@/components/providers/GtmUserProfileProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <VipStatusProvider>
        {/* <GtmUserProfileProvider> */}
          {children}
        {/* </GtmUserProfileProvider> */}
      </VipStatusProvider>
    </SessionProvider>
  );
} 