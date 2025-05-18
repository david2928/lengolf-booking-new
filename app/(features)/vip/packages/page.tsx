'use client';

import React from 'react';
import PackagesList from '../../../../components/vip/PackagesList'; // To be created
import { useVipContext } from '../contexts/VipContext';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';

const VipPackagesPage = () => {
  const { vipStatus, isLoadingVipStatus, session } = useVipContext();

  if (isLoadingVipStatus || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading package information...</p>
      </div>
    );
  }

  if (vipStatus && vipStatus.status !== 'linked_matched') {
    return (
      <div className="container mx-auto max-w-3xl py-8 px-4 text-center">
        <Alert variant="default" className="mb-6 bg-blue-50 border-blue-300 text-blue-700 [&>svg]:text-blue-700">
          <Info className="h-4 w-4" />
          <AlertTitle>Account Linking Required</AlertTitle>
          <AlertDescription>
            Please link your account to view your VIP packages. 
            Your current status is: <strong>{vipStatus.status}</strong>.
          </AlertDescription>
        </Alert>
        <Link href="/vip/link-account">
          <Button>Link Account Now</Button>
        </Link>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">My VIP Packages</h1>
      <PackagesList /> {/* This component will handle actual data fetching and display */}
    </div>
  );
};

export default VipPackagesPage; 