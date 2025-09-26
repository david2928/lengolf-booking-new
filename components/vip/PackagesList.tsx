'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { getVipPackages } from '../../lib/vipService';
import { VipPackage, VipApiError } from '../../types/vip';
import { useVipContext } from '../../app/(features)/vip/contexts/VipContext';
import { Loader2, PackageIcon, CalendarDays, CheckCircle, XCircle, Clock, AlertTriangle, Info, Users, Clock3, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from './EmptyState'; // Assuming EmptyState component exists
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import useMediaQuery from '../../hooks/useMediaQuery'; // Import the new hook
import { X, Maximize2 } from 'lucide-react';

// Full screen image modal component
const FullScreenImageModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  imageSrc: string; 
  imageAlt: string; 
}> = ({ isOpen, onClose, imageSrc, imageAlt }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-[95vw] max-h-[95vh]">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
        >
          <X size={32} />
        </button>
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={800}
          height={600}
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

// Promotional packages view component
const PromoPackagesView: React.FC = () => {
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  return (
    <>
      <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg p-4 md:p-6">
        <div className="text-center space-y-4">
          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-green-800">
              Get Your First Package!
            </h2>
            <p className="text-green-700 max-w-2xl mx-auto">
              Ready to take your golf game to the next level? Our monthly packages offer great 
              value and flexibility for regular practice and lessons.
            </p>
          </div>

          {/* Package Pricing Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 md:p-4 shadow-lg max-w-3xl mx-auto">
            <div 
              className="relative cursor-pointer group"
              onClick={() => setIsImageModalOpen(true)}
            >
              <Image
                src="/images/promotion_2.jpg"
                alt="Monthly Packages Pricing"
                width={600}
                height={400}
                className="w-full h-auto rounded-lg shadow-md transition-transform group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-lg flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2">
                  <Maximize2 size={20} className="text-gray-700" />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">Click to view full size</p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <a 
              href="https://lin.ee/uxQpIXn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#06C755] text-white px-6 py-2.5 rounded-lg hover:bg-[#05b04e] transition-colors font-medium shadow-md hover:shadow-lg transform hover:scale-105 transition-all min-w-[160px]"
            >
              <i className="fab fa-line text-lg"></i>
              Contact us via LINE
            </a>
            <Button asChild variant="outline" className="border-green-600 text-green-700 hover:bg-green-50 px-6 py-2.5 font-medium shadow-md hover:shadow-lg transform hover:scale-105 transition-all min-w-[160px]">
              <Link href="/bookings">
                Book a Session
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <FullScreenImageModal 
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        imageSrc="/images/promotion_2.jpg"
        imageAlt="Monthly Packages Pricing"
      />
    </>
  );
};

const PackagesList: React.FC = () => {
  const { vipStatus, isLoadingVipStatus, sharedData, updateSharedData, isSharedDataFresh } = useVipContext();
  const [activePackages, setActivePackages] = useState<VipPackage[]>([]);
  const [pastPackages, setPastPackages] = useState<VipPackage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPackages = useCallback(async (forceRefresh = false) => {
    if (!vipStatus) {
      setActivePackages([]);
      setPastPackages([]);
      return;
    }

    // For linked_unmatched users, don't call API to avoid rate limiting
    // But set loading/error states properly so they get the same UI as linked_matched users with no packages
    if (vipStatus.status === 'linked_unmatched') {
      setActivePackages([]);
      setPastPackages([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Only linked_matched users should fetch from API
    if (vipStatus.status !== 'linked_matched') {
      setActivePackages([]);
      setPastPackages([]);
      return;
    }

    // Use shared data if available and fresh, unless forcing refresh
    if (!forceRefresh && isSharedDataFresh() && (sharedData.activePackages.length > 0 || sharedData.pastPackages.length > 0)) {
      setActivePackages(sharedData.activePackages);
      setPastPackages(sharedData.pastPackages);
      setIsLoading(false);
      setError(null);
      return;
    }

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
    } catch (err: unknown) {
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
    // Allow both linked_matched and linked_unmatched users to fetch packages  
    if (vipStatus?.status === 'linked_matched' || vipStatus?.status === 'linked_unmatched') {
      fetchPackages();
    }
  }, [vipStatus, fetchPackages]);

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString + (dateString.includes('T') ? '' : 'T00:00:00'));
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        console.error('Failed to parse date');
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
            <>You don&apos;t have any active packages yet. <br />Contact us to purchase a practice or coaching package!</> :
            <>You haven&apos;t used any packages yet.</>
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

  // Only show account linking message for users who truly need to link
  if (vipStatus?.status === 'not_linked' || vipStatus?.status === 'vip_data_exists_crm_unmatched') {
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
      <PromoPackagesView />
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