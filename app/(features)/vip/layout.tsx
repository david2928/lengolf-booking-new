'use client';

import React, { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { Menu, X, ChevronDown, User, Package, Calendar, LogOut, Trophy, LinkIcon, LayoutDashboard } from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VipContextProvider, VipContextType, VipSharedData } from './contexts/VipContext';
import { getVipStatus } from '../../../lib/vipService'; // Adjusted path
import { VipStatusResponse, VipApiError } from '../../../types/vip'; // Adjusted path
import { Button } from '@/components/ui/button'; // Changed casing
import SharedFooter from '@/components/shared/Footer'; // Import the SharedFooter
import { useRouter } from 'next/navigation';

interface VipLayoutProps {
  children: ReactNode;
}

const VipLayout = ({ children }: VipLayoutProps) => {
  const { data: session, status: sessionStatus } = useSession();
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
      redirect('/auth/login?callbackUrl=/vip'); // Updated to redirect to /vip instead of /vip/dashboard
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
        <Button onClick={() => fetchVipStatus(true)}>Try Again</Button>
        <Button variant="outline" onClick={handleSignOut} className="ml-2">Sign Out</Button>
      </div>
    );
  }

  // Only show Link CRM Account for users who need linking
  // Exclude linked_unmatched users who have placeholder VIP accounts (vip_customer_data but no stable_hash_id)
  const shouldShowLinkCrmAccount = vipStatus?.status === 'not_linked' || 
    vipStatus?.status === 'vip_data_exists_crm_unmatched';

  return (
    <VipContextProvider value={contextValue}>
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="bg-primary text-primary-foreground py-4 sticky top-0 z-50 shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
                <button 
                  onClick={() => { router.push('/vip'); if (mobileMenuOpen) toggleMobileMenu(); }} 
                  className="text-2xl font-bold text-white hover:opacity-80 transition-opacity"
                >
                  <span className="md:hidden">LENGOLF</span>
                  <span className="hidden md:inline">LENGOLF</span>
                </button>
                <Link href="/vip" className="bg-white text-green-700 px-2 py-1 rounded-md text-sm font-medium">VIP</Link>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="md:hidden flex gap-1">
                {/* Mobile placeholder buttons to maintain consistent spacing */}
                <div className="w-0 h-0"></div>
              </div>

              <nav className="hidden md:flex gap-4 items-center">
                {/* Main booking actions - always prominent */}
                <Link href="/bookings" className="px-4 py-2 rounded-lg border border-white/20 hover:bg-white/10 transition-all duration-200 flex items-center gap-2 font-medium">
                  <Calendar size={16} />
                  New Booking
                </Link>
                
                {/* VIP-specific navigation in a more subtle dropdown */}
                <div className="flex items-center gap-3 ml-4 pl-4 border-l border-white/20">
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 px-4 py-2 rounded-lg hover:bg-white/10 transition-all duration-200 text-white outline-none">
                    My Account <ChevronDown size={16} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 mt-2">
                    <DropdownMenuItem asChild>
                      <Link href="/vip" className="flex items-center gap-2">
                        <LayoutDashboard size={16} />
                        <span>VIP Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/vip/bookings" className="flex items-center gap-2">
                        <Calendar size={16} />
                        <span>My Bookings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/vip/packages" className="flex items-center gap-2">
                        <Package size={16} />
                        <span>My Packages</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/vip/membership" className="flex items-center gap-2">
                        <Trophy size={16} />
                        <span>Membership</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/vip/profile" className="flex items-center gap-2">
                        <User size={16} />
                        <span>My Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    {shouldShowLinkCrmAccount && (
                      <DropdownMenuItem asChild>
                        <Link href="/vip/link-account" className="flex items-center gap-2 text-primary">
                          <LinkIcon size={16} />
                          <span>Link CRM Account</span>
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <button onClick={handleSignOut} className="flex items-center gap-2 w-full text-left">
                        <LogOut size={16} />
                        <span>Sign Out</span>
                      </button>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </nav>
              
              <button 
                className="md:hidden p-2 text-white hover:bg-white/10 rounded-md"
                onClick={toggleMobileMenu}
                aria-label="Toggle mobile menu"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
          
          {mobileMenuOpen && (
              <nav className="md:hidden mt-4 bg-primary pt-2 pb-3 border-t border-primary-foreground/20 text-primary-foreground">
              <ul className="space-y-2 px-2">
                  <li><Link href="/vip" className="block px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}>Dashboard</Link></li>
                
                  <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                    <p className="px-3 text-sm text-primary-foreground/60 uppercase font-medium">Profile</p>
                  <ul className="mt-1 space-y-1">
                      <li><Link href="/vip/profile" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><User size={16} />My Profile</Link></li>
                      {shouldShowLinkCrmAccount && (
                        <li><Link href="/vip/link-account" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10 text-accent" onClick={toggleMobileMenu}><LinkIcon size={16} />Link CRM Account</Link></li>
                      )}
                  </ul>
                </li>
                
                  <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                    <p className="px-3 text-sm text-primary-foreground/60 uppercase font-medium">Bookings</p>
                  <ul className="mt-1 space-y-1">
                      <li><Link href="/vip/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><Calendar size={16} />My Bookings</Link></li>
                      <li><Link href="/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><Calendar size={16} />New Booking</Link></li>
                  </ul>
                </li>
                
                  <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                    <Link href="/vip/packages" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><Package size={16} />My Packages</Link>
                </li>
                
                  <li><Link href="/vip/membership" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><Trophy size={16} />Membership</Link></li>
                
                  <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                    <button onClick={() => { handleSignOut(); toggleMobileMenu(); }} className="flex items-center gap-2 px-3 py-2 rounded-md w-full text-left hover:bg-primary-foreground/10"><LogOut size={16} />Sign Out</button>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </header>
      
        <main className="py-8 flex-grow container mx-auto px-4 sm:px-6 lg:px-8">
          {children}
      </main>
      
      <SharedFooter />
    </div>
    </VipContextProvider>
  );
};

export default VipLayout; 