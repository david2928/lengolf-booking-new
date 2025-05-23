'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PackagesList from '../../../../components/vip/PackagesList'; // To be created
import { useVipContext } from '../contexts/VipContext';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import EmptyState from '../../../../components/vip/EmptyState';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const VipPackagesPage = () => {
  const { vipStatus, isLoadingVipStatus, session } = useVipContext();
  const router = useRouter();

  // Redirect unlinked users to link-account page
  useEffect(() => {
    if (!isLoadingVipStatus && vipStatus && (
      vipStatus.status === 'not_linked' || 
      vipStatus.status === 'linked_unmatched' ||
      vipStatus.status === 'vip_data_exists_crm_unmatched'
    )) {
      router.replace('/vip/link-account');
    }
  }, [vipStatus, isLoadingVipStatus, router]);

  if (isLoadingVipStatus || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading package information...</p>
      </div>
    );
  }

  // Show loading while redirecting
  if (vipStatus && vipStatus.status !== 'linked_matched') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Redirecting to account linking...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Packages</h1>
        <p className="text-muted-foreground">View your active and past lesson or practice packages.</p>
      </div>
      <PackagesList /> {/* This component will handle actual data fetching and display */}
    </div>
  );
};

export default VipPackagesPage; 