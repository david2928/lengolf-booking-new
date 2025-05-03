'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { ChevronDownIcon, PhoneIcon, EnvelopeIcon, XMarkIcon, Bars3Icon, CurrencyDollarIcon, AcademicCapIcon, FireIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { Menu } from '@headlessui/react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [showBayRates, setShowBayRates] = useState(false);
  const [showPromotions, setShowPromotions] = useState(false);
  const [showLessons, setShowLessons] = useState(false);
  const [currentPromoIndex, setCurrentPromoIndex] = useState(0);

  // Sample promotion images - this would be replaced with your actual promotion images
  const promotionImages = [
    '/images/promotion.jpg',
    '/images/promotion_1.jpg',
    '/images/promotion_2.jpg',
    // Additional promotion images can be added here
  ];
  
  // Control body scroll when modals are open
  useEffect(() => {
    if (showBayRates || showPromotions || showLessons) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [showBayRates, showPromotions, showLessons]);

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

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-green-800 text-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            {/* Show full text on desktop, just "LENGOLF" on mobile */}
            <h1 className="text-2xl font-bold">
              <button 
                onClick={() => router.push('/bookings')} 
                className="hover:opacity-80 transition-opacity"
              >
                <span className="md:hidden">LENGOLF</span>
                <span className="hidden md:inline">LENGOLF Booking</span>
              </button>
            </h1>
            
            <div className="flex items-center gap-4">
              <div className="hidden md:flex gap-4 items-center">
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
              </div>
              
              {/* Mobile Buttons Row - Only show Rates and Promotions */}
              <div className="md:hidden flex gap-2">
                <button
                  onClick={() => setShowBayRates(!showBayRates)}
                  className="px-3 py-1 rounded-full border-2 border-white text-sm font-medium hover:bg-white hover:text-green-800 transition-colors flex items-center"
                >
                  <CurrencyDollarIcon className="h-4 w-4 mr-1" />
                  Rates
                </button>
                
                <button
                  onClick={() => setShowPromotions(!showPromotions)}
                  className="px-3 py-1 rounded-full border-2 border-white text-sm font-medium hover:bg-white hover:text-green-800 transition-colors flex items-center"
                >
                  <FireIcon className="h-4 w-4 mr-1" />
                  Promos
                </button>
              </div>
              
              {/* --- Desktop Auth Buttons --- */}
              <div className="hidden md:flex gap-4 items-center">
                <a 
                  href="https://www.len.golf" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-white hover:text-gray-200"
                >
                  Home Page
                </a>
                {status === 'authenticated' ? (
                  <button onClick={handleSignOut} className="text-white hover:text-gray-200">Logout</button>
                ) : (
                  <button onClick={() => signIn()} className="text-white hover:text-gray-200">Login</button>
                )}
              </div>
              <div className="md:hidden">
                <Menu as="div" className="relative">
                  <Menu.Button className="flex items-center text-white hover:text-gray-200">
                    <span className="sr-only">Open menu</span>
                    <Bars3Icon className="h-6 w-6" />
                  </Menu.Button>
                  <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <Menu.Item>
                      {({ active }) => (
                        <a
                          href="https://www.len.golf"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${
                            active ? 'bg-gray-100' : ''
                          } block px-4 py-2 text-sm text-gray-700`}
                        >
                          Home Page
                        </a>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => setShowLessons(!showLessons)}
                          className={`${
                            active ? 'bg-gray-100' : ''
                          } block w-full text-left px-4 py-2 text-sm text-gray-700 flex items-center`}
                        >
                          <AcademicCapIcon className="h-4 w-4 mr-2" />
                          Golf Lessons
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {/* --- Correct Conditional Auth Menu Item --- */}
                      {status === 'authenticated' && (
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={handleSignOut}
                              className={`${
                                active ? 'bg-gray-100' : ''
                              } block w-full text-left px-4 py-2 text-sm text-gray-700`}
                            >
                              Logout
                            </button>
                          )}
                        </Menu.Item>
                      )}
                      {status !== 'authenticated' && (
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={() => signIn()}
                              className={`${
                                active ? 'bg-gray-100' : ''
                              } block w-full text-left px-4 py-2 text-sm text-gray-700`}
                            >
                              Login
                            </button>
                          )}
                        </Menu.Item>
                      )}
                      {/* --- End Correct Conditional --- */}
                    </Menu.Item>
                  </Menu.Items>
                </Menu>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Bay Rates Modal */}
      {showBayRates && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowBayRates(false)}>
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

      {/* Promotions Modal */}
      {showPromotions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowPromotions(false)}>
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
                  
                  {/* Navigation arrows (only show if there's more than one promotion) */}
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
                  
                  {/* Dots indicators (only show if there's more than one promotion) */}
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

      {/* Lessons Modal */}
      {showLessons && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowLessons(false)}>
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

      {/* Main Content */}
      <main className="flex-grow mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Desktop Footer */}
          <div className="hidden md:grid md:grid-cols-4 gap-8">
            {/* Logo and Address */}
            <div className="flex flex-col">
              <a href="https://www.len.golf" className="mb-4">
                <Image
                  src="/images/logo_v1.png"
                  alt="LENGOLF Logo"
                  width={150}
                  height={50}
                  className="w-auto h-auto"
                />
              </a>
              <a 
                href="https://maps.app.goo.gl/M7ygv921XyzcQwBE8" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-800"
              >
                The Mercury Ville @ BTS Chidlom<br />
                Floor 4
              </a>
            </div>

            {/* Opening Hours */}
            <div>
              <h5 className="text-[#005a32] font-semibold mb-3">Opening Hours</h5>
              <p className="text-gray-600">
                10am - 11pm<br />
                Monday - Sunday
              </p>
            </div>

            {/* Keep in Touch */}
            <div>
              <h5 className="text-[#005a32] font-semibold mb-3">Keep in Touch</h5>
              <div className="text-gray-600 space-y-2">
                <a 
                  href="https://www.len.golf" 
                  className="block hover:text-gray-800"
                >
                  www.len.golf
                </a>
                <p className="flex items-center">
                  <PhoneIcon className="h-4 w-4 mr-2 text-[#005a32]" />
                  096-668-2335
                </p>
                <a 
                  href="mailto:info@len.golf" 
                  className="flex items-center hover:text-gray-800"
                >
                  <EnvelopeIcon className="h-4 w-4 mr-2 text-[#005a32]" />
                  info@len.golf
                </a>
                <a 
                  href="https://www.len.golf/privacy-policy/" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center hover:text-gray-800"
                >
                  <svg className="h-4 w-4 mr-2 text-[#005a32]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Privacy Policy
                </a>
              </div>
            </div>

            {/* Social Media */}
            <div>
              <h5 className="text-[#005a32] font-semibold mb-3">Follow Us</h5>
              <div className="flex space-x-4">
                <a 
                  href="https://www.facebook.com/lengolf.bkk" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#005a32] hover:text-[#007a42] transition-colors"
                >
                  <i className="fab fa-facebook-f text-xl"></i>
                </a>
                <a 
                  href="https://lin.ee/uxQpIXn" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#005a32] hover:text-[#007a42] transition-colors"
                >
                  <i className="fab fa-line text-xl"></i>
                </a>
                <a 
                  href="https://www.instagram.com/lengolf.bkk/" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#005a32] hover:text-[#007a42] transition-colors"
                >
                  <i className="fab fa-instagram text-xl"></i>
                </a>
              </div>
            </div>
          </div>

          {/* Mobile Footer */}
          <div className="md:hidden space-y-6">
            {/* Logo */}
            <div className="flex justify-center">
              <Image
                src="/images/logo_v1.png"
                alt="LENGOLF Logo"
                width={120}
                height={40}
                className="w-auto h-auto"
              />
            </div>

            {/* Address */}
            <div className="text-center">
              <a 
                href="https://maps.app.goo.gl/M7ygv921XyzcQwBE8" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-600"
              >
                The Mercury Ville @ BTS Chidlom<br />
                Floor 4
              </a>
            </div>

            {/* Opening Hours */}
            <div className="text-center">
              <h5 className="text-[#005a32] font-semibold mb-2">Opening Hours</h5>
              <p className="text-gray-600">
                10am - 11pm<br />
                Monday - Sunday
              </p>
            </div>

            {/* Contact Info */}
            <div className="text-center space-y-2">
              <h5 className="text-[#005a32] font-semibold mb-2">Keep in Touch</h5>
              <a 
                href="https://www.len.golf" 
                className="block text-gray-600"
              >
                www.len.golf
              </a>
              <p className="text-gray-600">
                <i className="fas fa-phone text-[#005a32] mr-2"></i>
                096-668-2335
              </p>
              <a 
                href="mailto:info@len.golf" 
                className="block text-gray-600"
              >
                <i className="fas fa-envelope text-[#005a32] mr-2"></i>
                info@len.golf
              </a>
              <a 
                href="https://www.len.golf/privacy-policy/" 
                target="_blank"
                rel="noopener noreferrer"
                className="block text-gray-600"
              >
                <i className="fas fa-file-alt text-[#005a32] mr-2"></i>
                Privacy Policy
              </a>
            </div>

            {/* Social Media Icons */}
            <div className="flex justify-center space-x-6">
              <a 
                href="https://www.facebook.com/lengolf.bkk" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#005a32] text-xl"
              >
                <i className="fab fa-facebook-f"></i>
              </a>
              <a 
                href="https://lin.ee/uxQpIXn" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#005a32] text-xl"
              >
                <i className="fab fa-line"></i>
              </a>
              <a 
                href="https://www.instagram.com/lengolf.bkk/" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#005a32] text-xl"
              >
                <i className="fab fa-instagram"></i>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
} 