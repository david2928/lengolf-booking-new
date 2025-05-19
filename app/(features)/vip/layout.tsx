'use client';

import React, { ReactNode, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { Menu, X, ChevronDown, User, Package, Calendar, LogOut, Trophy, LinkIcon } from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VipContextProvider, VipContextType } from './contexts/VipContext';
import { getVipStatus } from '../../../lib/vipService'; // Adjusted path
import { VipStatusResponse, VipApiError } from '../../../types/vip'; // Adjusted path
import { Button } from '@/components/ui/button'; // Changed casing
import SharedFooter from '@/components/shared/Footer'; // Import the SharedFooter

interface VipLayoutProps {
  children: ReactNode;
}

const VipLayout = ({ children }: VipLayoutProps) => {
  const { data: session, status: sessionStatus } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [vipStatus, setVipStatus] = useState<VipStatusResponse | null>(null);
  const [isLoadingVipStatus, setIsLoadingVipStatus] = useState(true);
  const [vipStatusError, setVipStatusError] = useState<Error | null>(null);

  const fetchVipStatus = useCallback(async () => {
    if (sessionStatus === 'authenticated') {
      setIsLoadingVipStatus(true);
      setVipStatusError(null);
      try {
        const status = await getVipStatus();
        setVipStatus(status);
      } catch (error) {
        console.error('Failed to fetch VIP status:', error);
        setVipStatusError(error as Error);
      } finally {
        setIsLoadingVipStatus(false);
      }
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      redirect('/auth/login?callbackUrl=/vip/dashboard'); // Or your app's login page
    }
    if (sessionStatus === 'authenticated') {
      fetchVipStatus();
    }
  }, [sessionStatus, fetchVipStatus]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' }); // Redirect to homepage after sign out
  };
  
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const contextValue: VipContextType = {
    session,
    vipStatus,
    isLoadingVipStatus,
    vipStatusError,
    refetchVipStatus: fetchVipStatus,
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
        <Button onClick={() => fetchVipStatus()}>Try Again</Button>
        <Button variant="outline" onClick={handleSignOut} className="ml-2">Sign Out</Button>
      </div>
    );
  }


  const isAccountUnmatched = vipStatus?.status === 'linked_unmatched' || vipStatus?.status === 'vip_data_exists_crm_unmatched';

  return (
    <VipContextProvider value={contextValue}>
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="bg-primary text-primary-foreground py-4 sticky top-0 z-50 shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
                <Link href="/vip" className="text-2xl font-bold text-white">LENGOLF</Link>
                <Link href="/vip" className="bg-white text-green-700 px-2 py-1 rounded-md text-sm font-medium">VIP</Link>
            </div>
            
              <nav className="hidden md:flex gap-x-6 items-center text-white">
                <Link href="/vip" className="hover:text-gray-200">Dashboard</Link>
                
                  <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 hover:text-gray-200 outline-none">
                      Bookings <ChevronDown size={16} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link href="/vip/bookings" className="flex items-center gap-2">
                          <Calendar size={16} />
                        <span>My Bookings</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                      <Link href="/bookings" className="flex items-center gap-2">
                        <Calendar size={16} /> 
                          <span>New Booking</span>
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                
                <Link href="/vip/packages" className="hover:text-gray-200">Packages</Link>
                <Link href="/vip/membership" className="hover:text-gray-200">Membership</Link>

                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 hover:text-gray-200 outline-none">
                    Profile <ChevronDown size={16} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56"> 
                    <DropdownMenuItem asChild>
                      <Link href="/vip/profile" className="flex items-center gap-2">
                        <User size={16} />
                        <span>My Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    {isAccountUnmatched && (
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
            </nav>
            
            <button 
                className="md:hidden p-2 text-primary-foreground hover:bg-primary-foreground/10 rounded-md"
              onClick={toggleMobileMenu}
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          
          {mobileMenuOpen && (
              <nav className="md:hidden mt-4 bg-primary pt-2 pb-3 border-t border-primary-foreground/20 text-primary-foreground">
              <ul className="space-y-2 px-2">
                  <li><Link href="/vip" className="block px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}>Dashboard</Link></li>
                
                  <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                    <p className="px-3 text-sm text-primary-foreground/60 uppercase font-medium">Profile</p>
                  <ul className="mt-1 space-y-1">
                      <li><Link href="/vip/profile" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><User size={16} />My Profile</Link></li>
                      {isAccountUnmatched && (
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