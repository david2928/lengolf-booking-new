'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProfileView from '../../../../components/vip/ProfileView'; 
import { useVipContext } from '../contexts/VipContext'; 
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Needs installation
import { AlertCircle, Loader2 } from 'lucide-react';

const VipProfilePage = () => {
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
        <p className="text-muted-foreground">Loading profile information...</p>
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
    <div className="container mx-auto max-w-3xl py-8 px-4">
       {vipStatus && vipStatus.status === 'not_linked' && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Account Not Linked</AlertTitle>
          <AlertDescription>
            Your account is not linked to a VIP profile. Please link your account from the dashboard to access VIP features.
            The profile information below might be limited.
          </AlertDescription>
        </Alert>
      )}
      <ProfileView />
    </div>
  );
};

export default VipProfilePage; 