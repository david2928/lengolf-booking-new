'use client';

import React from 'react';
import ProfileView from '../../../../components/vip/ProfileView'; 
import { useVipContext } from '../contexts/VipContext'; 
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Needs installation
import { AlertCircle, Loader2 } from 'lucide-react';

const VipProfilePage = () => {
  const { vipStatus, isLoadingVipStatus, session } = useVipContext();

  if (isLoadingVipStatus || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading profile information...</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">
      {vipStatus && (vipStatus.status === 'linked_unmatched' || vipStatus.status === 'vip_data_exists_crm_unmatched') && (
        <Alert variant="default" className="mb-6 bg-yellow-50 border-yellow-300 text-yellow-700 [&>svg]:text-yellow-700"> 
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Account Not Fully Synced</AlertTitle>
          <AlertDescription>
            Your account is linked but some information might not be fully synced with our CRM. 
            You can view and update your VIP-specific details below. For primary account changes, please contact support or check your main Lengolf profile.
          </AlertDescription>
        </Alert>
      )}
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