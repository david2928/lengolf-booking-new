'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVipStatus } from '@/components/providers/VipStatusProvider';
import { toast } from 'react-hot-toast';
import { ChevronDownIcon, XMarkIcon, CurrencyDollarIcon, AcademicCapIcon, FireIcon, HomeIcon as HeroHomeIcon, UserIcon as HeroUserIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import SharedFooter from '@/components/shared/Footer';
import Header from '@/components/shared/Header';
import { LogOut, Package as PackageIconLucide, Calendar as CalendarIconLucide, Trophy as TrophyIconLucide, Link as LinkIconLucideRadix, User as UserIconLucide } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { vipProfile, isLoading: vipLoading, error: vipError, refetchVipProfile } = useVipStatus();
  const [isLoading, setIsLoading] = useState(false);
  const [showBayRates, setShowBayRates] = useState(false);
  const [showPromotions, setShowPromotions] = useState(false);
  const [showLessons, setShowLessons] = useState(false);
  const [currentPromoIndex, setCurrentPromoIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const promotionImages = [
    '/images/promotion.jpg',
    '/images/promotion_1.jpg',
    '/images/promotion_2.jpg',
  ];
  
  useEffect(() => {
    if (showBayRates || showPromotions || showLessons || mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [showBayRates, showPromotions, showLessons, mobileMenuOpen]);

  // Warm up VIP profile cache early for faster "My Account" navigation
  useEffect(() => {
    if (sessionStatus === 'authenticated' && !vipProfile && !vipLoading && !vipError) {
      // Trigger VIP profile fetch in the background to warm cache
      refetchVipProfile();
    }
  }, [sessionStatus, vipProfile, vipLoading, vipError, refetchVipProfile]);

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut({ redirect: false });
      router.push('/auth/login');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  // Check if user is an account that should show VIP features (not guest)
  const isVipEligible = sessionStatus === 'authenticated' && session?.user?.provider !== 'guest';
  
  // Determine if user needs to link their account
  const isAccountUnmatched = vipProfile && (
    vipProfile.crmStatus === 'not_linked' ||
    vipProfile.crmStatus === 'vip_data_exists_crm_unmatched'
  );

  // Determine if user is linked and can access VIP features
  // linked_unmatched users can access most VIP features, only linked_matched get full CRM features
  const isUserLinked = vipProfile && (vipProfile.crmStatus === 'linked_matched' || vipProfile.crmStatus === 'linked_unmatched');

  // Show Link Account for authenticated users who truly need linking
  const shouldShowLinkAccount = sessionStatus === 'authenticated' && isAccountUnmatched;


  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        title="LENGOLF"
        badge={{
          text: "Booking",
          href: "/bookings"
        }}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={toggleMobileMenu}
        rightContent={
          <>
            <div className="md:hidden flex gap-1">
              <button
                onClick={() => setShowBayRates(true)}
                className="p-2 text-white hover:bg-white/10 rounded-md"
                aria-label="Bay Rates"
              >
                <CurrencyDollarIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowPromotions(true)}
                className="p-2 text-white hover:bg-white/10 rounded-md"
                aria-label="Promotions"
              >
                <FireIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowLessons(true)}
                className="p-2 text-white hover:bg-white/10 rounded-md"
                aria-label="Golf Lessons"
              >
                <AcademicCapIcon className="h-5 w-5" />
              </button>
            </div>

            <nav className="hidden md:flex gap-4 items-center">
              {/* Primary booking-related actions - clean and minimal */}
              <button
                onClick={() => setShowBayRates(!showBayRates)}
                className="text-white px-4 py-2 rounded-lg border border-white/30 hover:bg-white/10 transition-all duration-200 flex items-center gap-2 font-medium"
              >
                <CurrencyDollarIcon className="h-4 w-4" />
                <span>Bay Rates</span>
              </button>
              <button
                onClick={() => setShowPromotions(!showPromotions)}
                className="text-white px-4 py-2 rounded-lg border border-white/30 hover:bg-white/10 transition-all duration-200 flex items-center gap-2 font-medium"
              >
                <FireIcon className="h-4 w-4" />
                <span>Promotions</span>
              </button>
              <button
                onClick={() => setShowLessons(!showLessons)}
                className="text-white px-4 py-2 rounded-lg border border-white/30 hover:bg-white/10 transition-all duration-200 flex items-center gap-2 font-medium"
              >
                <AcademicCapIcon className="h-4 w-4" />
                <span>Lessons</span>
              </button>

              {/* Vertical separator */}
              <div className="h-6 w-px bg-white/30"></div>

              {/* Simple My Account dropdown */}
              {sessionStatus === 'authenticated' && vipLoading ? (
                <div className="flex items-center gap-2 px-4 py-2 text-white">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : sessionStatus === 'authenticated' ? (
                <>
                  {/* Only show My Account dropdown for non-guest users */}
                  {isVipEligible ? (
                    <div className="relative group">
                      <button 
                        className="flex items-center gap-1 px-4 py-2 rounded-lg hover:bg-white/10 transition-all duration-200 text-white"
                        onMouseEnter={() => {
                          // Prefetch VIP routes on hover for better perceived performance
                          if (vipProfile && (vipProfile.crmStatus === 'linked_matched' || vipProfile.crmStatus === 'linked_unmatched')) {
                            router.prefetch('/vip');
                            router.prefetch('/vip/profile');
                            router.prefetch('/vip/bookings');
                            router.prefetch('/vip/packages');
                          }
                        }}
                      >
                        My Account <ChevronDownIcon className="h-4 w-4" />
                      </button>
                      
                      {/* Dropdown menu */}
                      <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                        <Link href="/vip" className="flex items-center gap-2 px-4 py-3 text-green-700 hover:bg-green-50 transition-colors font-medium border-b border-green-100">
                          <span>Dashboard</span>
                          <span className="ml-auto bg-green-700 text-white px-2 py-0.5 rounded text-xs font-medium">VIP</span>
                        </Link>
                        
                        {isUserLinked ? (
                          <>
                            <div className="border-t border-gray-100"></div>
                            {console.log('[Booking Layout] Rendering VIP navigation links for linked user')}
                            <Link href="/vip/profile" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors">
                              <UserIconLucide className="h-4 w-4" />
                              <span>My Profile</span>
                            </Link>
                            <Link href="/vip/bookings" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors">
                              <CalendarIconLucide className="h-4 w-4" />
                              <span>My Bookings</span>
                            </Link>
                            <Link href="/vip/packages" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors">
                              <PackageIconLucide className="h-4 w-4" />
                              <span>My Packages</span>
                            </Link>
                            <Link href="/vip/membership" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors">
                              <TrophyIconLucide className="h-4 w-4" />
                              <span>Membership</span>
                            </Link>
                          </>
                        ) : shouldShowLinkAccount ? (
                          <>
                            <div className="border-t border-gray-100"></div>
                            <Link href="/vip/link-account" className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors font-medium">
                              <LinkIconLucideRadix className="h-4 w-4" />
                              <span>Link Account to Access VIP Features</span>
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
                          <HeroHomeIcon className="h-4 w-4" />
                          <span>Main Site</span>
                        </a>
                        <button 
                          onClick={handleSignOut} 
                          disabled={isLoading}
                          className="flex items-center gap-2 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors w-full text-left disabled:opacity-50"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>{isLoading ? 'Signing Out...' : 'Sign Out'}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    // For guest users, just show a simple sign out button
                    <button
                      onClick={handleSignOut}
                      disabled={isLoading}
                      className="text-white px-4 py-2 rounded-lg border border-white/30 hover:bg-white hover:text-green-800 transition-all duration-200 flex items-center gap-2 font-medium disabled:opacity-50"
                    >
                      <LogOut className="h-5 w-5" />
                      {isLoading ? 'Signing Out...' : 'Sign Out'}
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => signIn()}
                  className="text-white px-4 py-2 rounded-lg border border-white/30 hover:bg-white hover:text-green-800 transition-all duration-200 flex items-center gap-2 font-medium"
                >
                  <HeroUserIcon className="h-5 w-5" />
                  Sign In
                </button>
              )}
            </nav>
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
                        {console.log('[Booking Layout] Rendering mobile VIP navigation for linked user')}
                        <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                          <p className="px-3 text-sm text-primary-foreground/60 uppercase font-medium">PROFILE</p>
                          <ul className="mt-1 space-y-1">
                            <li><Link href="/vip/profile" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><UserIconLucide size={16} />My Profile</Link></li>
                          </ul>
                        </li>
                        
                        <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                          <p className="px-3 text-sm text-primary-foreground/60 uppercase font-medium">BOOKINGS</p>
                          <ul className="mt-1 space-y-1">
                            <li><Link href="/vip/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><CalendarIconLucide size={16} />My Bookings</Link></li>
                            <li><Link href="/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><CalendarIconLucide size={16}/>New Booking</Link></li>
                          </ul>
                        </li>
                        
                        <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                          <p className="px-3 text-sm text-primary-foreground/60 uppercase font-medium">PACKAGES</p>
                          <ul className="mt-1 space-y-1">
                            <li><Link href="/vip/packages" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><PackageIconLucide size={16} />My Packages</Link></li>
                          </ul>
                        </li>
                        
                        <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                          <Link href="/vip/membership" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><TrophyIconLucide size={16} />Membership</Link>
                        </li>
                      </>
                    )}
                    
                    {shouldShowLinkAccount && (
                      <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                        <Link href="/vip/link-account" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10 font-medium" onClick={toggleMobileMenu}><LinkIconLucideRadix size={16} />Link Account</Link>
                      </li>
                    )}
                  </>
               ) : (
                  <li><Link href="/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10" onClick={toggleMobileMenu}><CalendarIconLucide size={16}/>New Booking</Link></li>
               )}
              
              <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                <a 
                  href="https://len.golf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10"
                  onClick={toggleMobileMenu}
                >
                  <HeroHomeIcon className="h-4 w-4" />
                  Main Site
                </a>
              </li>
              
              <li className="border-t border-primary-foreground/20 pt-2 mt-2">
                {sessionStatus === 'authenticated' ? (
                  <button onClick={() => { handleSignOut(); toggleMobileMenu(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10 text-left"><LogOut size={16} />Sign Out</button>
                ) : (
                  <button onClick={() => { signIn(); toggleMobileMenu(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary-foreground/10 text-left"><LogOut size={16} />Sign In</button>
                )}
              </li>
            </ul>
          </nav>
        }
      />

      {showBayRates && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={() => setShowBayRates(false)}>
          <div className="bg-white rounded-xl p-4 max-w-2xl w-full mx-4 md:mx-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center">
                <CurrencyDollarIcon className="h-6 w-6 mr-2 text-green-600" />
                Bay Rates
              </h3>
              <button onClick={() => setShowBayRates(false)} className="text-gray-500 hover:text-gray-700">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="relative">
              <Image
                src="/images/lengolf_bay_rate.jpg"
                alt="LENGOLF Bay Rates"
                width={800}
                height={600}
                className="rounded-xl w-full h-auto object-contain"
                priority
              />
            </div>
          </div>
        </div>
      )}

      {showPromotions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={() => setShowPromotions(false)}>
          <div className="bg-white rounded-xl p-4 max-w-2xl w-full mx-4 md:mx-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center">
                <FireIcon className="h-6 w-6 mr-2 text-green-600" />
                Promotions
              </h3>
              <button onClick={() => setShowPromotions(false)} className="text-gray-500 hover:text-gray-700">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="relative">
              {promotionImages.length > 0 ? (
                <div className="relative">
                  <Image
                    src={promotionImages[currentPromoIndex]}
                    alt={`LENGOLF Promotion ${currentPromoIndex + 1}`}
                    width={800}
                    height={600}
                    className="rounded-xl w-full h-auto object-contain"
                    priority
                  />
                  
                  {promotionImages.length > 1 && (
                    <div className="absolute inset-0 flex items-center justify-between pointer-events-none">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentPromoIndex((prevIndex) => 
                            prevIndex === 0 ? promotionImages.length - 1 : prevIndex - 1
                          );
                        }}
                        className="bg-black bg-opacity-40 hover:bg-opacity-60 text-white p-2 rounded-full ml-2 pointer-events-auto"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                        </svg>
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentPromoIndex((prevIndex) => 
                            (prevIndex + 1) % promotionImages.length
                          );
                        }}
                        className="bg-black bg-opacity-40 hover:bg-opacity-60 text-white p-2 rounded-full mr-2 pointer-events-auto"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                    </div>
                  )}
                  
                  {promotionImages.length > 1 && (
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
                      {promotionImages.map((_, index) => (
                        <button
                          key={index}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentPromoIndex(index);
                          }}
                          className={`w-2.5 h-2.5 rounded-full pointer-events-auto ${
                            currentPromoIndex === index ? 'bg-white' : 'bg-white bg-opacity-50'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-10 bg-gray-50 rounded-xl">
                  <p className="text-gray-500">No promotions available at the moment.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showLessons && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={() => setShowLessons(false)}>
          <div className="bg-white rounded-xl p-4 max-w-2xl w-full mx-4 md:mx-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center">
                <AcademicCapIcon className="h-6 w-6 mr-2 text-green-600" />
                Golf Lessons
              </h3>
              <button onClick={() => setShowLessons(false)} className="text-gray-500 hover:text-gray-700">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-2 bg-white rounded-xl">
              <div className="text-center mb-4">
                <Image
                  src="/images/coaching_1.jpg"
                  alt="LENGOLF Lessons"
                  width={500}
                  height={375}
                  className="rounded-xl w-auto h-auto mx-auto object-contain mb-4"
                />
                <h4 className="text-lg font-semibold text-gray-900 mb-2">Book Professional Golf Lessons</h4>
                <p className="text-gray-600 mb-4">
                  Improve your golf skills with our professional instructors. 
                  Various lesson packages available for beginners to advanced players.
                  <span className="font-medium block mt-1">Golf lessons can only be booked via LINE.</span>
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3 mb-4">
                  <a 
                    href="https://lin.ee/uxQpIXn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-[#06C755] text-white px-4 py-2 rounded-lg hover:bg-[#05b04e] transition-colors"
                  >
                    <i className="fab fa-line text-xl"></i>
                    Contact via LINE
                  </a>
                  <a 
                    href="https://www.len.golf/lessons"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    View for more information
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="py-8 flex-grow container mx-auto px-4 sm:px-6 lg:px-8">
        {children}
      </main>

      <SharedFooter />
    </div>
  );
} 