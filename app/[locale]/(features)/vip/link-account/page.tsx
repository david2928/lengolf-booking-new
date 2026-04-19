'use client';

import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import ManualLinkAccountForm from '@/components/vip/ManualLinkAccountForm';
import { useVipContext } from '../contexts/VipContext';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // User needs to ensure this component is installed (e.g., npx shadcn-ui@latest add alert)

const LinkAccountPage = () => {
  const { session, vipStatus, isLoadingVipStatus } = useVipContext();
  const router = useRouter();
  const t = useTranslations('vip.linkAccount');

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
        <p className="text-muted-foreground">{t('loadingStatus')}</p>
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
            {vipStatus.status === 'linked_matched' ? t('alreadyLinkedTitle') : t('vipReadyTitle')}
          </h2>
          <p className="text-muted-foreground mb-4">
            {vipStatus.status === 'linked_matched'
              ? t('alreadyLinkedBody')
              : t('vipReadyBody')}
          </p>
          <p className="text-muted-foreground">{t('redirectingToDashboard')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-8 px-4">
      {vipStatus.status === 'not_linked' && (
         <Alert className="mb-6" variant="default">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('linkRequiredTitle')}</AlertTitle>
            <AlertDescription>
              {t('linkRequiredBody')}
            </AlertDescription>
        </Alert>
      )}
      {vipStatus.status === 'vip_data_exists_crm_unmatched' && (
         <Alert variant="default" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('finalStepTitle')}</AlertTitle>
            <AlertDescription>
              {t('finalStepBody')}
            </AlertDescription>
        </Alert>
      )}
      <ManualLinkAccountForm userName={session.user?.name} />
    </div>
  );
};

export default LinkAccountPage; 