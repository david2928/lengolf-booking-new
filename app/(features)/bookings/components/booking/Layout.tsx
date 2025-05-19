'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVipStatus } from '@/components/providers/VipStatusProvider';
import { toast } from 'react-hot-toast';
import { ChevronDownIcon, PhoneIcon, EnvelopeIcon, XMarkIcon, Bars3Icon, CurrencyDollarIcon, AcademicCapIcon, FireIcon, UserCircleIcon as HeroUserCircleIcon, TicketIcon, LinkIcon as LinkIconLucide, HomeIcon as HeroHomeIcon, UserIcon as HeroUserIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import SharedFooter from '@/components/shared/Footer';
import { LogOut, Menu as MenuLucide, X, Package as PackageIconLucide, Calendar as CalendarIconLucide, Trophy as TrophyIconLucide, Link as LinkIconLucideRadix, User as UserIconLucide, LayoutDashboard as LayoutDashboardIcon } from 'lucide-react';

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

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const crmStatus = vipProfile?.crmStatus;
  const isAccountUnmatched = crmStatus === 'linked_unmatched' ||
                             crmStatus === 'not_linked' ||
                             crmStatus === 'vip_data_exists_crm_unmatched';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-green-800 text-white sticky top-0 z-50 shadow-md">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">
              <button 
                onClick={() => { router.push('/bookings'); if (mobileMenuOpen) toggleMobileMenu(); }} 
                className="hover:opacity-80 transition-opacity"
              >
                <span className="md:hidden">LENGOLF</span>
                <span className="hidden md:inline">LENGOLF Booking</span>
              </button>
            </h1>
            
            <div className="flex items-center gap-2">
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
                <button
                  onClick={() => setShowBayRates(!showBayRates)}
                  className="text-white px-3 py-1.5 rounded-full border-2 border-white hover:bg-white hover:text-green-800 transition-colors flex items-center gap-1 font-medium"
                >
                  <CurrencyDollarIcon className="h-5 w-5" />
                  <span>Bay Rates</span>
                </button>
                <button
                  onClick={() => setShowPromotions(!showPromotions)}
                  className="text-white px-3 py-1.5 rounded-full border-2 border-white hover:bg-white hover:text-green-800 transition-colors flex items-center gap-1 font-medium"
                >
                  <FireIcon className="h-5 w-5" />
                  <span>Promotions</span>
                </button>
                <button
                  onClick={() => setShowLessons(!showLessons)}
                  className="text-white px-3 py-1.5 rounded-full border-2 border-white hover:bg-white hover:text-green-800 transition-colors flex items-center gap-1 font-medium"
                >
                  <AcademicCapIcon className="h-5 w-5" />
                  <span>Lessons</span>
                </button>

                {sessionStatus === 'authenticated' && !vipLoading && vipProfile && (
                  <>
                    {vipProfile.crmStatus === 'linked_matched' ? (
                      <Link href="/vip" className="text-white px-3 py-1.5 rounded-full border-2 border-yellow-400 hover:bg-yellow-400 hover:text-green-800 transition-colors flex items-center gap-1 font-medium">
                        <HeroUserCircleIcon className="h-5 w-5" />
                        <span>VIP Dashboard</span>
                      </Link>
                    ) : (
                      <Link href="/vip/link-account" className="text-white px-3 py-1.5 rounded-full border-2 border-blue-400 hover:bg-blue-400 hover:text-green-800 transition-colors flex items-center gap-1 font-medium">
                        <LinkIconLucideRadix className="h-5 w-5" />
                        <span>Link VIP Account</span>
                      </Link>
                    )}
                  </>
                )}
                <a 
                  href="https://www.len.golf" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-white hover:text-gray-200"
                >
                  Home
                </a>
                {sessionStatus === 'authenticated' ? (
                  <button onClick={handleSignOut} className="text-white hover:text-gray-200">Logout</button>
                ) : (
                  <button onClick={() => signIn()} className="text-white hover:text-gray-200">Login</button>
                )}
              </nav>
              
              <button 
                className="md:hidden p-2 text-white hover:bg-white/10 rounded-md"
                onClick={toggleMobileMenu}
                aria-label="Toggle main menu"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <MenuLucide className="h-6 w-6" />}
              </button>
            </div>
          </div>
          
          {mobileMenuOpen && (
            <nav className="md:hidden mt-4 bg-green-800 pt-2 pb-3 border-t border-white/20 text-white">
              <ul className="space-y-2 px-2">
                {sessionStatus === 'authenticated' ? (
                    <li>
                      <Link href="/vip" className="flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-white/10" onClick={toggleMobileMenu}>
                        <span className="flex items-center gap-2">
                          Dashboard
                        </span>
                        <span className="bg-white text-green-700 px-1.5 py-0.5 rounded-sm text-xs font-semibold">VIP</span>
                      </Link>
                    </li>
                 ) : (
                    <li><Link href="/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10" onClick={toggleMobileMenu}><CalendarIconLucide size={16}/>New Booking</Link></li>
                 )}
                
                {sessionStatus === 'authenticated' && (
                  <>
                    <li className="border-t border-white/20 pt-2 mt-2">
                        <p className="px-3 text-sm text-white/60 uppercase font-medium">Profile</p>
                        <ul className="mt-1 space-y-1">
                            <li><Link href="/vip/profile" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10" onClick={toggleMobileMenu}><UserIconLucide size={16} />My Profile</Link></li>
                            {isAccountUnmatched && (
                                <li><Link href="/vip/link-account" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 text-blue-300" onClick={toggleMobileMenu}><LinkIconLucideRadix size={16} />Link Account</Link></li>
                            )}
                        </ul>
                    </li>
                    <li className="border-t border-white/20 pt-2 mt-2">
                        <p className="px-3 text-sm text-white/60 uppercase font-medium">Bookings</p>
                        <ul className="mt-1 space-y-1">
                            <li><Link href="/vip/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10" onClick={toggleMobileMenu}><CalendarIconLucide size={16} />My Bookings</Link></li>
                            <li><Link href="/bookings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10" onClick={toggleMobileMenu}><CalendarIconLucide size={16} />New Booking</Link></li>
                        </ul>
                    </li>
                    <li className="border-t border-white/20 pt-2 mt-2">
                        <p className="px-3 text-sm text-white/60 uppercase font-medium">Packages</p>
                        <ul className="mt-1 space-y-1">
                            <li><Link href="/vip/packages" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10" onClick={toggleMobileMenu}><PackageIconLucide size={16} />My Packages</Link></li>
                        </ul>
                    </li>
                    <li className="border-t border-white/20 pt-2 mt-2">
                      <Link href="/vip/membership" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10" onClick={toggleMobileMenu}><TrophyIconLucide size={16} />Membership</Link>
                    </li>
                  </>
                )}
                
                <li className="border-t border-white/20 pt-2 mt-2">
                  {sessionStatus === 'authenticated' ? (
                    <button onClick={() => { handleSignOut(); toggleMobileMenu(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 text-left"><LogOut size={16} />Sign Out</button>
                  ) : (
                    <button onClick={() => { signIn(); toggleMobileMenu(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 text-left"><LogOut size={16} />Sign In</button>
                  )}
                </li>
              </ul>
            </nav>
          )}
        </div>
      </header>

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

      <main className="flex-grow mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>

      <SharedFooter />
    </div>
  );
} 