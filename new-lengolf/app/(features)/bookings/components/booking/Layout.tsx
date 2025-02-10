'use client';

import { ChevronDownIcon, PhoneIcon, EnvelopeIcon, XMarkIcon, Bars3Icon, CurrencyDollarIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useState } from 'react';
import { Menu } from '@headlessui/react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [showBayRates, setShowBayRates] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-green-800 text-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            {/* Show full text on desktop, just "LENGOLF" on mobile */}
            <h1 className="text-2xl font-bold">
              <span className="md:hidden">LENGOLF</span>
              <span className="hidden md:inline">LENGOLF Booking</span>
            </h1>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowBayRates(!showBayRates)}
                className="text-white hover:text-gray-200 flex items-center gap-2"
              >
                <span className="hidden md:inline">Bay Rates</span>
                <span className="md:hidden px-3 py-1 rounded-full border-2 border-white text-sm font-medium hover:bg-white hover:text-green-800 transition-colors">
                  Rates
                </span>
              </button>
              <div className="hidden md:flex gap-4">
                <a href="/" className="text-white hover:text-gray-200">Home Page</a>
                <button onClick={handleLogout} className="text-white hover:text-gray-200">Logout</button>
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
                          href="/"
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
                          onClick={handleLogout}
                          className={`${
                            active ? 'bg-gray-100' : ''
                          } block w-full text-left px-4 py-2 text-sm text-gray-700`}
                        >
                          Logout
                        </button>
                      )}
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
              <h3 className="text-xl md:text-2xl font-bold text-gray-900">Bay Rates</h3>
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