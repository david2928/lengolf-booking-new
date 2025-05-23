'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getVipPackages } from '../../lib/vipService';
import { VipPackage, VipApiError } from '../../types/vip';
import { useVipContext } from '../../app/(features)/vip/contexts/VipContext';
import { Loader2, PackageIcon, CalendarDays, CheckCircle, XCircle, Clock, AlertTriangle, Info, Users, Clock3, Star, FlagTriangleRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from './EmptyState'; // Assuming EmptyState component exists
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import useMediaQuery from '../../hooks/useMediaQuery'; // Import the new hook

const PackagesList: React.FC = () => {
  const { vipStatus, isLoadingVipStatus, sharedData, updateSharedData, isSharedDataFresh } = useVipContext();
  const [activePackages, setActivePackages] = useState<VipPackage[]>([]);
  const [pastPackages, setPastPackages] = useState<VipPackage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPackages = useCallback(async (forceRefresh = false) => {
    if (!vipStatus || vipStatus.status !== 'linked_matched') {
      setActivePackages([]);
      setPastPackages([]);
      return;
    }

    // Use shared data if available and fresh, unless forcing refresh
    if (!forceRefresh && isSharedDataFresh() && (sharedData.activePackages.length > 0 || sharedData.pastPackages.length > 0)) {
      console.log('[PackagesList] Using shared packages data from context');
      setActivePackages(sharedData.activePackages);
      setPastPackages(sharedData.pastPackages);
      setIsLoading(false);
      setError(null);
      return;
    }

    console.log('[PackagesList] Fetching packages data from API (forceRefresh:', forceRefresh, ')');
    setIsLoading(true);
    setError(null);
    try {
      const data = await getVipPackages();
      const activePackages = data.activePackages || [];
      const pastPackages = data.pastPackages || [];
      
      setActivePackages(activePackages);
      setPastPackages(pastPackages);
      
      // Update shared data context
      updateSharedData({ 
        activePackages,
        pastPackages
      });
    } catch (err: any) {
      console.error('Failed to fetch packages:', err);
      let errorMessage = 'Could not load packages.';
      if (err instanceof VipApiError) {
        errorMessage = err.payload?.message || err.message || errorMessage;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [vipStatus, isSharedDataFresh, sharedData.activePackages, sharedData.pastPackages, updateSharedData]);

  useEffect(() => {
    if (vipStatus?.status === 'linked_matched') {
      fetchPackages();
    }
  }, [vipStatus, fetchPackages]);

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString + (dateString.includes('T') ? '' : 'T00:00:00'));
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return dateString; // Return original if parsing fails
    }
  };

  const PackageCard: React.FC<{ pkg: VipPackage }> = ({ pkg }) => {
    let remainingDisplay: React.ReactNode;
    const [isExpanded, setIsExpanded] = useState(false);
    const isMobile = useMediaQuery('(max-width: 767px)'); // md breakpoint in Tailwind is 768px

    const title = pkg.package_display_name || pkg.packageName;

    const isUnlimited = pkg.packageCategory?.toLowerCase().includes('unlimited');
    const isCoaching = pkg.packageCategory?.toLowerCase().includes('coaching');
    const isPractice = !isCoaching && !isUnlimited;

    let packageTypeBadgeText = pkg.packageCategory || 'Package'; // Default

    if (isCoaching) {
      if (pkg.pax !== undefined && pkg.pax !== null) {
        packageTypeBadgeText = `${pkg.pax} Pax`;
      } else {
        packageTypeBadgeText = 'Coaching';
      }
    } else if (isUnlimited) {
      packageTypeBadgeText = 'Unlimited';
    } else { // Practice packages (non-coaching, non-unlimited)
      if (pkg.totalHours !== undefined && pkg.totalHours !== null) {
        packageTypeBadgeText = `${pkg.totalHours} Hour${pkg.totalHours === 1 ? '' : 's'}`;
      } else if (pkg.packageCategory) {
        packageTypeBadgeText = pkg.packageCategory;
      } else {
        packageTypeBadgeText = 'Practice'; // Fallback for practice if no hours/category
      }
    }

    if (isUnlimited) {
      remainingDisplay = "Unlimited Usage";
    } else if (pkg.remainingHours !== undefined && pkg.remainingHours !== null) {
      remainingDisplay = `${pkg.remainingHours} hour${pkg.remainingHours === 1 ? '' : 's'} remaining`;
    } else {
      remainingDisplay = "N/A";
    }

    let statusColor = 'text-gray-600';
    let statusBgColor = 'bg-gray-100';
    let StatusIcon = Info;

    switch (pkg.status?.toLowerCase()) {
      case 'active':
        statusColor = 'text-green-700';
        statusBgColor = 'bg-green-100';
        StatusIcon = CheckCircle;
        break;
      case 'expired':
        statusColor = 'text-red-700';
        statusBgColor = 'bg-red-100';
        StatusIcon = XCircle;
        break;
      case 'depleted':
        statusColor = 'text-yellow-700';
        statusBgColor = 'bg-yellow-100';
        StatusIcon = Clock;
        break;
    }

    const packageDetailsContent = (
      <div className="space-y-1.5 text-xs">
        {pkg.purchaseDate && (
          <p className="flex items-center"><CalendarDays size={14} className="mr-1.5 text-gray-400"/>Purchased: {formatDate(pkg.purchaseDate)}</p>
        )}
        {pkg.first_use_date && (
          <p className="flex items-center"><CalendarDays size={14} className="mr-1.5 text-gray-400"/>First Used: {formatDate(pkg.first_use_date)}</p>
        )}
        {!isUnlimited && pkg.totalHours !== undefined && pkg.totalHours !== null && (
          <p className="flex items-center"><Clock size={14} className="mr-1.5 text-gray-400"/>Total: {pkg.totalHours} hour{pkg.totalHours === 1 ? '' : 's'}</p>
        )}
        {!isUnlimited && pkg.usedHours !== undefined && pkg.usedHours !== null && (
           <p className="flex items-center"><Clock3 size={14} className="mr-1.5 text-gray-400"/>Used: {pkg.usedHours} hour{pkg.usedHours === 1 ? '' : 's'}</p>
        )}
        {pkg.pax !== undefined && isCoaching && (
           <p className="flex items-center"><Users size={14} className="mr-1.5 text-gray-400"/>Pax: {pkg.pax}</p>
        )}
        {pkg.validityPeriod && !pkg.expiryDate && (
          <p className="flex items-center"><CalendarDays size={14} className="mr-1.5 text-gray-400"/>Validity: {pkg.validityPeriod}</p>
        )}
         {(!pkg.purchaseDate && !pkg.first_use_date && (isUnlimited || pkg.totalHours === undefined || pkg.totalHours === null) && !(pkg.pax !== undefined && isCoaching) && (!pkg.validityPeriod || pkg.expiryDate)) && (
          <p className="text-gray-400">No additional details available.</p>
        )}
      </div>
    );

    return (
      <Card className="shadow-md hover:shadow-lg transition-shadow w-full flex flex-col">
        <TooltipProvider delayDuration={300}>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start mb-2">
              <CardTitle className="text-xl font-bold text-primary">{title}</CardTitle>
              <div className="flex items-center">
                {!isMobile && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info size={16} className="mr-2 text-gray-400 hover:text-gray-600 cursor-pointer" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-gray-800 text-white text-xs rounded-md shadow-lg p-2 max-w-fit">
                      {packageDetailsContent}
                    </TooltipContent>
                  </Tooltip>
                )}
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full flex items-center ${statusBgColor} ${statusColor}`}>
                  <StatusIcon size={14} className="mr-1.5" />
                  {pkg.status ? pkg.status.charAt(0).toUpperCase() + pkg.status.slice(1) : 'Unknown'}
                </span>
              </div>
            </div>
            {!isUnlimited && (
              <span className={`inline-block px-3 py-1 text-xs font-bold rounded-full border border-gray-300 bg-gray-100 text-gray-600 w-auto max-w-min whitespace-nowrap`}>
                  {packageTypeBadgeText}
              </span>
            )}
          </CardHeader>
        </TooltipProvider>

        <CardContent className="space-y-3 text-sm flex-grow">
          <div className={`text-lg font-bold text-gray-800 flex items-center mb-1`}> 
            {remainingDisplay}
          </div>

          {pkg.expiryDate && (
            <div className="text-sm text-gray-600 flex items-center">
              <CalendarDays size={14} className="mr-1.5 text-gray-500" /> 
              Expires: {formatDate(pkg.expiryDate)}
              { (new Date(pkg.expiryDate) > new Date()) && (pkg.remainingHours === null || (pkg.remainingHours !== undefined && pkg.remainingHours > 0)) &&
                (() => {
                  const todayDate = new Date();
                  const expiry = new Date(pkg.expiryDate as string);
                  todayDate.setHours(0, 0, 0, 0);
                  expiry.setHours(0, 0, 0, 0);
                  const diffTime = Math.abs(expiry.getTime() - todayDate.getTime());
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  if (diffDays >= 0) { 
                    return <span className="ml-1">({diffDays} day{diffDays !== 1 ? 's' : ''} left)</span>;
                  }
                  return null;
                })()
              }
            </div>
          )}
        </CardContent>
        
        {isMobile && (
          <div className="px-6 pb-2">
            <Button 
              variant="link"
              className="text-primary p-0 h-auto text-xs"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <><ChevronUp size={14} className="mr-1" /> Hide Details</>
              ) : (
                <><ChevronDown size={14} className="mr-1" /> Show Details</>
              )}
            </Button>
            {isExpanded && (
              <div className="mt-2 py-2 border-t border-gray-200">
                {packageDetailsContent}
              </div>
            )}
          </div>
        )}

        <div className="px-6 pb-4 mt-auto">
          <div className="mt-4 pt-3 border-t">
            {isCoaching ? (
              <a href="https://lin.ee/uxQpIXn" target="_blank" rel="noopener noreferrer" className="w-full">
                <Button className="w-full" variant="default">
                  <Users size={16} className="mr-2" /> Arrange Lesson (LINE)
                </Button>
              </a>
            ) : (
              <Link href="/bookings/create" className="w-full">
                <Button className="w-full" variant="default">
                  <PackageIcon size={16} className="mr-2" /> Book Now
                </Button>
              </Link>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderPackageGroup = (packages: VipPackage[], title: string) => {
    if (packages.length === 0) {
      return (
        <EmptyState
          Icon={PackageIcon}
          title={`No ${title.toLowerCase()} found`}
          message={title === 'Active Packages' ? 
            <>You don't have any active packages yet. <br />Contact us to purchase a practice or coaching package!</> :
            <>You haven't used any packages yet.</>
          }
          action={title === 'Active Packages' ? {
            text: "Contact Us",
            href: "https://lin.ee/uxQpIXn"
          } : undefined}
          className="mt-4"
        />
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {packages.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>
    );
  };

  if (isLoadingVipStatus || isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading packages...</span>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        Icon={AlertTriangle}
        title="Error Loading Packages"
        message={error}
        action={{ text: "Try Again", onClick: () => fetchPackages(true) }}
        className="mt-4"
      />
    );
  }

  if (vipStatus?.status !== 'linked_matched') {
    return (
      <EmptyState
        Icon={Info}
        title="Account Linking Required"
        message={<>
          Please link your account to view your packages and track usage.
        </>}
        action={{
          text: "Link Account Now",
          href: "/vip/link-account"
        }}
        className="mt-4"
      />
    );
  }

  const hasActivePackages = activePackages.length > 0;
  const hasPastPackages = pastPackages.length > 0;

  if (!hasActivePackages && !hasPastPackages) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-8 text-center">
        <div className="space-y-4">
          <PackageIcon className="mx-auto h-16 w-16 text-green-600" />
          <h2 className="text-2xl font-bold text-green-800">Get Started with Packages</h2>
          <p className="text-green-700 max-w-2xl mx-auto">
            Practice packages and coaching sessions help you improve your game. 
            Contact us to learn about available packages and pricing.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
            <a 
              href="https://lin.ee/uxQpIXn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#06C755] text-white px-6 py-3 rounded-lg hover:bg-[#05b04e] transition-colors font-medium"
            >
              <i className="fab fa-line text-xl"></i>
              Contact us via LINE
            </a>
            <Button asChild variant="outline" className="border-green-600 text-green-700 hover:bg-green-50">
              <Link href="/bookings">
                Book Individual Session
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800">
            Active Packages ({activePackages.length})
          </TabsTrigger>
          <TabsTrigger value="past" className="data-[state=active]:bg-gray-100 data-[state=active]:text-gray-800">
            Past Packages ({pastPackages.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="mt-6">
          {renderPackageGroup(activePackages, 'Active Packages')}
        </TabsContent>
        
        <TabsContent value="past" className="mt-6">
          {renderPackageGroup(pastPackages, 'Past Packages')}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PackagesList;