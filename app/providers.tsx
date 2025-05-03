'use client';

import { SessionProvider } from 'next-auth/react';
// import { GtmUserProfileProvider } from '@/components/providers/GtmUserProfileProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* <GtmUserProfileProvider> */}
        {children}
      {/* </GtmUserProfileProvider> */}
    </SessionProvider>
  );
} 