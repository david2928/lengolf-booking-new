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

  // Redirect if user is already matched
  useEffect(() => {
    if (vipStatus?.status === 'linked_matched') {
      router.replace('/vip/dashboard');
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

  if (vipStatus.status === 'linked_matched') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <p className="text-muted-foreground">Account already linked. Redirecting to dashboard...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-8 px-4">
      {(vipStatus.status === 'not_linked' || vipStatus.status === 'linked_unmatched') && (
         <Alert className="mb-6" variant={vipStatus.status === 'linked_unmatched' ? "default" : "default"}> {/* Default variant, or can be more specific */}
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Account Link Required</AlertTitle>
            <AlertDescription>
              It seems your current login is not yet fully associated with a Lengolf VIP profile. Please link your account using your phone number to access all VIP features.
            </AlertDescription>
        </Alert>
      )}
       {vipStatus.status === 'vip_data_exists_crm_unmatched' && (
         <Alert variant="default" className="mb-6"> {/* ShadCN warning variant is often yellow-ish */}
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Final Linking Step Needed</AlertTitle>
            <AlertDescription>
              We found some VIP data for your login, but it needs to be matched to our main customer records. Please provide your phone number to complete the link.
            </AlertDescription>
        </Alert>
      )}
      <ManualLinkAccountForm userName={session.user?.name} />
    </div>
  );
};

export default LinkAccountPage; 