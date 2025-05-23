'use client';

import React, { useEffect } from 'react';
import ManualLinkAccountForm from '../../../../components/vip/ManualLinkAccountForm';
import { useVipContext } from '../contexts/VipContext'; 
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // User needs to ensure this component is installed (e.g., npx shadcn-ui@latest add alert)

const LinkAccountPage = () => {
  const { session, vipStatus, isLoadingVipStatus } = useVipContext();
  const router = useRouter();

  // Enhanced access control: Redirect users who don't need linking
  useEffect(() => {
    if (vipStatus?.status === 'linked_matched') {
      // Account is already fully linked
      router.replace('/vip');
    } else if (vipStatus?.status === 'vip_data_exists_crm_unmatched') {
      // User has VIP data but no customer match - they can use this page
      return;
    } else if (vipStatus?.status === 'linked_unmatched') {
      // User has placeholder VIP account - redirect to dashboard as they don't need linking
      router.replace('/vip');
    } else if (vipStatus?.status === 'not_linked') {
      // User is completely unlinked - they can use this page
      return;
    }
  }, [vipStatus, router]);

  if (isLoadingVipStatus || !vipStatus || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-muted-foreground">Loading account status...</p>
      </div>
    );
  }

  // Redirect screen for users who don't need linking
  if (vipStatus.status === 'linked_matched' || vipStatus.status === 'linked_unmatched') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-green-700 mb-2">
            {vipStatus.status === 'linked_matched' ? 'Account Already Linked' : 'VIP Account Ready'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {vipStatus.status === 'linked_matched' 
              ? 'Your account is already connected to your customer profile.' 
              : 'Your VIP account is set up and ready to use.'}
          </p>
          <p className="text-muted-foreground">Redirecting to VIP dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-8 px-4">
      {vipStatus.status === 'not_linked' && (
         <Alert className="mb-6" variant="default">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Account Link Required</AlertTitle>
            <AlertDescription>
              Connect your account using your phone number to access all VIP features including bookings and packages.
            </AlertDescription>
        </Alert>
      )}
      {vipStatus.status === 'vip_data_exists_crm_unmatched' && (
         <Alert variant="default" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Final Linking Step Needed</AlertTitle>
            <AlertDescription>
              We found some VIP data for your login, but it needs to be matched to your customer records. Please provide your phone number to complete the link.
            </AlertDescription>
        </Alert>
      )}
      <ManualLinkAccountForm userName={session.user?.name} />
    </div>
  );
};

export default LinkAccountPage; 