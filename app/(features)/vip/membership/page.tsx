'use client';

import React from 'react';
import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button'; // Assuming Button component is available
import Link from 'next/link'; // For optional button
import { useTranslations } from 'next-intl';

const MembershipComingSoonPage = () => {
  const tVip = useTranslations('vip');
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[calc(100vh-300px)] text-center p-6 bg-background">
      <Construction size={64} className="text-primary mb-6" />
      <h1 className="text-3xl font-bold text-foreground mb-3">
        {tVip('membershipComingSoon')}
      </h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-md">
        {tVip('membershipComingSoonMessage')}
      </p>
      {/* Optional: Add a button to go back to VIP home or another relevant page */}
      <Button asChild variant="outline">
        <Link href="/vip">{tVip('backToVipDashboard')}</Link>
      </Button>
    </div>
  );
};

export default MembershipComingSoonPage; 