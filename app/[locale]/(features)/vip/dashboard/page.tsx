'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

const VipDashboardRedirectPage = () => {
  const router = useRouter();
  const t = useTranslations('vip.linkAccount');

  useEffect(() => {
    // Redirect to the main VIP page where the dashboard content actually lives
    router.replace('/vip');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
      <p className="text-muted-foreground">{t('redirectingToDashboard')}</p>
    </div>
  );
};

export default VipDashboardRedirectPage; 