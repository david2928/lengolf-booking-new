'use client';

import React, { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { ChevronDown, User, Package, Calendar, LogOut, Trophy, LinkIcon, ExternalLink } from 'lucide-react';
import { VipContextProvider, VipContextType, VipSharedData } from './contexts/VipContext';
import { getVipStatus } from '../../../lib/vipService'; // Adjusted path
import { VipStatusResponse, VipApiError } from '../../../types/vip'; // Adjusted path
import SharedFooter from '@/components/shared/Footer'; // Import the SharedFooter
import Header from '@/components/shared/Header';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface VipLayoutProps {
  children: ReactNode;
}

const VipLayout = ({ children }: VipLayoutProps) => {
  const { data: session, status: sessionStatus } = useSession();
  const tNav = useTranslations('navigation');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();

  const [vipStatus, setVipStatus] = useState<VipStatusResponse | null>(null);
  const [isLoadingVipStatus, setIsLoadingVipStatus] = useState(true);
  const [vipStatusError, setVipStatusError] = useState<Error | null>(null);

  // Shared data state to reduce redundant API calls across components
  const [sharedData, setSharedData] = useState<VipSharedData>({
    profile: null,
    recentBookings: [],
    activePackages: [],
    pastPackages: [],
    lastDataFetch: null,
  });

  // Cache for VIP status to prevent unnecessary API calls
  const vipStatusCache = useRef<{
    status: VipStatusResponse | null;
    lastFetchTime: number | null;
    sessionId: string | null; // Track session to detect user changes
  }>({
    status: null,
    lastFetchTime: null,
    sessionId: null,
  });

  // Cache expiry time in milliseconds (5 minutes)
  const VIP_STATUS_CACHE_EXPIRY_MS = 5 * 60 * 1000;

  const isVipStatusCacheValid = useCallback(() => {
    const cache = vipStatusCache.current;
    const currentTime = Date.now();
    const currentSessionId = session?.user?.id || null;
    
    // Cache is invalid if:
    // 1. No last fetch time
    // 2. Cache has expired
    // 3. Session user has changed
    if (!cache.lastFetchTime) return false;
    if (currentTime - cache.lastFetchTime > VIP_STATUS_CACHE_EXPIRY_MS) return false;
    if (cache.sessionId !== currentSessionId) return false;
    
    return true;
  }, [session?.user?.id]);

  const fetchVipStatus = useCallback(async (forceRefresh = false) => {
    if (sessionStatus !== 'authenticated' || !session?.user?.id) return;

    // Use cache if valid and not forced to refresh
    if (!forceRefresh && isVipStatusCacheValid()) {
      const cachedStatus = vipStatusCache.current.status;
      if (cachedStatus) {
        setVipStatus(cachedStatus);
        setIsLoadingVipStatus(false);
        setVipStatusError(null);
        return;
      }
    }

    setIsLoadingVipStatus(true);
    setVipStatusError(null);
    try {
      const status = await getVipStatus();
      setVipStatus(status);
      
      // Update cache
      vipStatusCache.current = {
        status,
        lastFetchTime: Date.now(),
        sessionId: session.user.id,
      };
    } catch (error) {
      console.error('Failed to fetch VIP status:', error);
      setVipStatusError(error as Error);
    } finally {
      setIsLoadingVipStatus(false);
    }
  }, [sessionStatus, session?.user?.id, isVipStatusCacheValid]);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      // Preserve language parameter in redirect
      const currentUrl = new URL(window.location.href);
      const lang = currentUrl.searchParams.get('lang');
      const callbackUrl = lang ? `/vip?lang=${lang}` : '/vip';
      const redirectUrl = lang ? `/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}&lang=${lang}` : '/auth/login?callbackUrl=/vip';
      redirect(redirectUrl);
    }
    
    if (sessionStatus === 'authenticated') {
      fetchVipStatus();
    }
  }, [sessionStatus, fetchVipStatus]);

  const handleSignOut = async () => {
    // Clear cache on sign out
    vipStatusCache.current = {
      status: null,
      lastFetchTime: null,
      sessionId: null,
    };
    await signOut({ callbackUrl: '/' }); // Redirect to homepage after sign out
  };
  
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  // Shared data management functions
  const updateSharedData = useCallback((data: Partial<VipSharedData>) => {
    setSharedData(prev => ({
      ...prev,
      ...data,
      lastDataFetch: Date.now(),
    }));
  }, []);

  const isSharedDataFresh = useCallback((maxAgeMs: number = 3 * 60 * 1000) => {
    if (!sharedData.lastDataFetch) return false;
    return Date.now() - sharedData.lastDataFetch < maxAgeMs;
  }, [sharedData.lastDataFetch]);

  const contextValue: VipContextType = {
    session,
    vipStatus,
    isLoadingVipStatus,
    vipStatusError,
    refetchVipStatus: () => fetchVipStatus(true), // Force refresh when explicitly called
    sharedData,
    updateSharedData,
    isSharedDataFresh,
  };

  if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && isLoadingVipStatus && !vipStatus && !vipStatusError)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-muted-foreground text-lg">Loading VIP Area...</p>
      </div>
    );
  }
  
  if (sessionStatus === 'unauthenticated') {
      // This should ideally not be reached if redirect works immediately
      // but as a fallback or if redirect is not instant.
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background">
          <p className="text-muted-foreground text-lg">Redirecting to login...</p>
        </div>
      );
  }

  // Show error message if VIP status failed to load for an authenticated user
  if (sessionStatus === 'authenticated' && vipStatusError && !isLoadingVipStatus) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <h2 className="text-2xl font-semibold text-destructive mb-4">Error Loading VIP Information</h2>
        <p className="text-muted-foreground mb-4">
          We couldn't retrieve your VIP status at the moment. Please try again later.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          {(vipStatusError as VipApiError)?.payload?.message || vipStatusError.message}
        </p>
        <button onClick={() => fetchVipStatus(true)}>Try Again</button>
        <button onClick={handleSignOut} className="ml-2">Sign Out</button>
      </div>
    );
  }

  // Determine if user is linked to show appropriate menu items
  // linked_unmatched users can access most VIP features, only linked_matched get full CRM features
  const isUserLinked = vipStatus?.status === 'linked_matched' || vipStatus?.status === 'linked_unmatched';
  
  // Show Link Account only for users who truly need linking
  const shouldShowLinkAccount = vipStatus?.status === 'not_linked' || 
    vipStatus?.status === 'vip_data_exists_crm_unmatched';

  // Check if user is eligible for VIP features (not guest)
  const isVipEligible = sessionStatus === 'authenticated' && session?.user?.provider !== 'guest';

  return (
    <VipContextProvider value={contextValue}>
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        title="LENGOLF"
        badge={{
          text: "VIP",
          href: "/vip"
        }}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={toggleMobileMenu}
        rightContent={
          <>
            <div className="md:hidden flex gap-1">
              {/* Mobile placeholder buttons to maintain consistent spacing */}
              <div className="w-0 h-0"></div>
            </div>

            {isVipEligible ? (
              <nav className="hidden md:flex gap-4 items-center">
                {/* Add New Booking button like in the booking layout */}
                <Link href="/bookings">
                  <button className="text-white px-4 py-2 rounded-lg border border-white/30 hover:bg-white/10 transition-all duration-200 flex items-center gap-2 font-medium">
                    <Calendar className="h-4 w-4" />
                    <span>{tNav('newBooking')}</span>
                  </button>
                </Link>

                {/* Vertical separator */}
                <div className="h-6 w-px bg-white/30"></div>

                {/* Simple My Account dropdown */}
                <div className="relative group">
                  <button className="flex items-center gap-1 px-4 py-2 rounded-lg hover:bg-white/10 transition-all duration-200 text-white">
                    {tNav('myAccount')} <ChevronDown size={16} />
                  </button>
                  
                  {/* Dropdown menu - matching booking layout style with separators */}
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <Link href="/vip" className="flex items-center gap-2 px-4 py-3 text-green-700 hover:bg-green-50 transition-colors font-medium border-b border-green-100">
                      <span>{tNav('dashboard')}</span>
                      <span className="ml-auto bg-green-700 text-white px-2 py-0.5 rounded text-xs font-medium">VIP</span>
                    </Link>
                    
                    {isUserLinked ? (
                      <>
                        <div className="border-t border-gray-100"></div>
                        <Link href="/vip/profile" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors">
                          <User size={16} />
                          <span>{tNav('myProfile')}</span>
                        </Link>
                        <Link href="/vip/bookings" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors">
                          <Calendar size={16} />
                          <span>{tNav('myBookings')}</span>
                        </Link>
                        <Link href="/vip/packages" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors">
                          <Package size={16} />
                          <span>{tNav('myPackages')}</span>
                        </Link>
                        <Link href="/vip/membership" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors">
                          <Trophy size={16} />
                          <span>{tNav('membership')}</span>
                        </Link>
                      </>
                    ) : shouldShowLinkAccount ? (
                      <>
                        <div className="border-t border-gray-100"></div>
                        <Link href="/vip/link-account" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors font-medium">
                          <LinkIcon size={16} />
                          <span>{tNav('linkAccount')}</span>
                        </Link>
                      </>
                    ) : null}
                    
                    <div className="border-t border-gray-100"></div>
                    <a 
                      href="https://len.golf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <ExternalLink size={16} />
                      <span>{tNav('mainSite')}</span>
                    </a>
                    <button onClick={handleSignOut} className="flex items-center gap-2 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors w-full text-left">
                      <LogOut size={16} />
                      <span>{tNav('signOut')}</span>
                    </button>
                  </div>
                </div>
              </nav>
            ) : sessionStatus === 'authenticated' ? (
              <nav className="hidden md:flex gap-4 items-center">
                <Link href="/bookings">
                  <button className="text-white px-4 py-2 rounded-lg border border-white/30 hover:bg-white/10 transition-all duration-200 flex items-center gap-2 font-medium">
                    <Calendar className="h-4 w-4" />
                    <span>{tNav('newBooking')}</span>
                  </button>
                </Link>

                {/* Vertical separator */}
                <div className="h-6 w-px bg-white/30"></div>

                <button onClick={handleSignOut} className="text-white px-4 py-2 rounded-lg border border-white/30 hover:bg-white hover:text-green-800 transition-all duration-200 flex items-center gap-2 font-medium">
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </nav>
            ) : null}
          </>
        }
        mobileMenu={
          <nav className="md:hidden mt-4 bg-primary pt-2 pb-3 border-t border-primary-foreground/20 text-primary-foreground">
            <ul className="space-y-2 px-2">
              {sessionStatus === 'authenticated' && isVipEligible ? (
                <>
                  <li>
                    <Link href="/vip" className="flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10 bg-primary-foreground/5 border border-white/10" onClick={toggleMobileMenu}>
                      <span className="flex items-center gap-2 font-medium">
                        Dashboard
                      </span>
                      <span className="bg-white text-green-700 px-2 py-0.5 rounded text-xs font-medium">VIP</span>
                    </Link>
                  </li>
                
                  {isUserLinked && (
                    <>
                      <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                        <p className="px-3 text-sm text-primary-foreground/60 uppercase font-medium">PROFILE</p>
                        <ul className="mt-1 space-y-1">
                          <li><Link href="/vip/profile" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><User size={16} />My Profile</Link></li>
                        </ul>
                      </li>
                      
                      <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                        <p className="px-3 text-sm text-primary-foreground/60 uppercase font-medium">BOOKINGS</p>
                        <ul className="mt-1 space-y-1">
                          <li><Link href="/vip/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><Calendar size={16} />{tNav('myBookings')}</Link></li>
                          <li><Link href="/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><Calendar size={16} />{tNav('newBooking')}</Link></li>
                        </ul>
                      </li>
                      
                      <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                        <p className="px-3 text-sm text-primary-foreground/60 uppercase font-medium">PACKAGES</p>
                        <ul className="mt-1 space-y-1">
                          <li><Link href="/vip/packages" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><Package size={16} />My Packages</Link></li>
                        </ul>
                      </li>
                      
                      <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                        <Link href="/vip/membership" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><Trophy size={16} />Membership</Link>
                      </li>
                    </>
                  )}
                  
                  {shouldShowLinkAccount && (
                    <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                      <Link href="/vip/link-account" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10 font-medium" onClick={toggleMobileMenu}><LinkIcon size={16} />Link Account</Link>
                    </li>
                  )}
                </>
              ) : (
                <li><Link href="/bookings" className="block px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}>{tNav('newBooking')}</Link></li>
              )}
            
              <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                <a 
                  href="https://len.golf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10"
                  onClick={toggleMobileMenu}
                >
                  <ExternalLink size={16} />
                  Main Site
                </a>
              </li>
              
              <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                <button onClick={() => { handleSignOut(); toggleMobileMenu(); }} className="flex items-center gap-2 px-3 py-2 rounded-md w-full text-left hover:bg-primary-foreground/10"><LogOut size={16} />Sign Out</button>
            </li>
            </ul>
          </nav>
        }
      />
      
        <main className="py-8 flex-grow container mx-auto px-4 sm:px-6 lg:px-8">
          {children}
      </main>
      
      <SharedFooter />
    </div>
    </VipContextProvider>
  );
};

export default VipLayout; 