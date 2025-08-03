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
import { useTranslations } from 'next-intl';

const VipPackagesPage = () => {
  const { vipStatus, isLoadingVipStatus, session } = useVipContext();
  const router = useRouter();
  const tVip = useTranslations('vip');

  // Redirect unlinked users to link-account page
  // Note: linked_unmatched users can access this page but will see empty state
  useEffect(() => {
    if (!isLoadingVipStatus && vipStatus && (
      vipStatus.status === 'not_linked' || 
      vipStatus.status === 'vip_data_exists_crm_unmatched'
    )) {
      router.replace('/vip/link-account');
    }
  }, [vipStatus, isLoadingVipStatus, router]);

  if (isLoadingVipStatus || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{tVip('loadingPackageInfo')}</p>
      </div>
    );
  }

  // Show loading while redirecting (only for users who actually need to be redirected)
  if (vipStatus && (vipStatus.status === 'not_linked' || vipStatus.status === 'vip_data_exists_crm_unmatched')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{tVip('redirectingToAccountLinking')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{tVip('myPackagesTitle')}</h1>
        <p className="text-muted-foreground">{tVip('myPackagesDescription')}</p>
      </div>
      <PackagesList /> {/* This component will handle actual data fetching and display */}
    </div>
  );
};

export default VipPackagesPage; 