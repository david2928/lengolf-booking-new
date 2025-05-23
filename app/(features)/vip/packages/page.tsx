'use client';

import React from 'react';
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

  if (isLoadingVipStatus || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading package information...</p>
      </div>
    );
  }

  // For unmatched users, show promotional content encouraging package purchase
  if (vipStatus && vipStatus.status !== 'linked_matched') {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold text-gray-800 tracking-tight">My Packages</h1>
        <p className="text-muted-foreground">View your active and past lesson or practice packages.</p>
        
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-8 text-center">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-green-800">Link Your Account to View Packages</h2>
            <p className="text-green-700 max-w-2xl mx-auto">
              Connect your account to your Lengolf customer profile to view your active packages, 
              track usage, and manage your golf memberships.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
              <Button asChild className="bg-green-600 hover:bg-green-700">
                <Link href="/vip/link-account">
                  Link Account Now
                </Link>
              </Button>
              <a 
                href="https://lin.ee/uxQpIXn"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[#06C755] text-white px-4 py-2 rounded-lg hover:bg-[#05b04e] transition-colors"
              >
                <i className="fab fa-line text-xl"></i>
                Contact us via LINE
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-gray-800 tracking-tight">My Packages</h1>
      <p className="text-muted-foreground">View your active and past lesson or practice packages.</p>
      <PackagesList /> {/* This component will handle actual data fetching and display */}
    </div>
  );
};

export default VipPackagesPage; 