'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getVipPackages } from '../../lib/vipService';
import { VipPackage, VipPackagesResponse, VipApiError } from '../../types/vip';
import { useVipContext } from '../../app/(features)/vip/contexts/VipContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, PackageCheck, PackageX, History, AlertTriangle, PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import EmptyState from './EmptyState';

const PackagesList: React.FC = () => {
  const { vipStatus, isLoadingVipStatus, refetchVipStatus } = useVipContext();
  const [packagesData, setPackagesData] = useState<VipPackagesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    if (!vipStatus || vipStatus.status !== 'linked_matched') {
      setPackagesData(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getVipPackages();
      setPackagesData(data);
    } catch (err: any) {
      console.error('Failed to fetch packages:', err);
      let errorMessage = 'Could not load packages.';
      if (err instanceof VipApiError) {
        errorMessage = err.payload?.message || err.message || errorMessage;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      setPackagesData(null);
    } finally {
      setIsLoading(false);
    }
  }, [vipStatus]);

  useEffect(() => {
    if (vipStatus?.status === 'linked_matched') {
      fetchPackages();
    } else if (!isLoadingVipStatus && vipStatus) {
      setPackagesData(null);
      setIsLoading(false);
    }
  }, [vipStatus, fetchPackages, isLoadingVipStatus]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString + 'T00:00:00').toLocaleDateString('en-CA'); // YYYY-MM-DD
  };

  if (isLoadingVipStatus) { // This check should be in the parent page ideally, but for standalone use:
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2 text-muted-foreground">Verifying account status...</span></div>;
  }

  // vipStatus check is handled by the parent page (VipPackagesPage), so we assume if this component renders,
  // vipStatus is linked_matched, or the parent shows an appropriate message.
  // However, adding a local loading state for the packages fetch itself:
  if (isLoading && !packagesData) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2 text-muted-foreground">Loading packages...</span></div>;
  }

  if (error) {
    return (
      <EmptyState 
        Icon={AlertTriangle}
        title="Error Loading Packages"
        message={error}
        action={{ text: "Try Again", onClick: fetchPackages }}
        className="mt-4"
      />
    );
  }

  if (!packagesData || (packagesData.activePackages.length === 0 && packagesData.pastPackages.length === 0)) {
    return (
      <EmptyState
        Icon={PackageSearch}
        title="No Packages Found"
        message="You do not have any active or past VIP packages associated with your account."
        // action={{ text: "Explore Packages", href: "/store/vip-packages" }} // Example action, commented out
        className="mt-4"
      />
    );
  }

  const renderPackageCard = (pkg: VipPackage) => (
    <Card key={pkg.id} className="mb-4 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          {pkg.status === 'active' && <PackageCheck className="h-6 w-6 mr-2 text-green-600" />}
          {pkg.status === 'depleted' && <PackageX className="h-6 w-6 mr-2 text-orange-500" />}
          {pkg.status === 'expired' && <History className="h-6 w-6 mr-2 text-red-500" />}
          {pkg.packageName}
        </CardTitle>
        <CardDescription>
          Purchased: {formatDate(pkg.purchaseDate)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <p className="font-medium text-muted-foreground">Status</p>
          <p className={`font-semibold capitalize 
            ${pkg.status === 'active' ? 'text-green-600' : 
              pkg.status === 'depleted' ? 'text-orange-500' : 
              pkg.status === 'expired' ? 'text-red-500' : 'text-foreground'}
          `}>{pkg.status}</p>
        </div>
        <div>
          <p className="font-medium text-muted-foreground">Sessions Remaining</p>
          <p className="font-semibold">{pkg.remainingSessions} / {pkg.totalSessions}</p>
        </div>
        <div>
          <p className="font-medium text-muted-foreground">Expiry Date</p>
          <p className="font-semibold">{formatDate(pkg.expiryDate)}</p>
        </div>
      </CardContent>
      {/* Add CardFooter if needed for actions like "Renew" or "Details" if applicable */}
    </Card>
  );

  return (
    <Tabs defaultValue="active" className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:w-[300px] bg-muted p-1 rounded-lg mb-6">
        <TabsTrigger value="active" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Active Packages ({packagesData.activePackages.length})</TabsTrigger>
        <TabsTrigger value="past" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Past Packages ({packagesData.pastPackages.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="active">
        {packagesData.activePackages.length > 0 ? (
          packagesData.activePackages.map(renderPackageCard)
        ) : (
          <p className="text-muted-foreground text-center py-6">No active packages found.</p>
        )}
      </TabsContent>
      <TabsContent value="past">
        {packagesData.pastPackages.length > 0 ? (
          packagesData.pastPackages.map(renderPackageCard)
        ) : (
          <p className="text-muted-foreground text-center py-6">No past or expired packages found.</p>
        )}
      </TabsContent>
    </Tabs>
  );
};

export default PackagesList; 