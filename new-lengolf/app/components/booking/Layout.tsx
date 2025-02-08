import { ChevronDownIcon, PhoneIcon, EnvelopeIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useState } from 'react';
import { Menu } from '@headlessui/react';

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

export default function Layout({ children, onLogout }: LayoutProps) {
  const [showBayRates, setShowBayRates] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-green-800 text-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">LENGOLF Booking</h1>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowBayRates(!showBayRates)}
                className="text-white hover:text-gray-200 flex items-center gap-2"
              >
                <span>Bay Rates</span>
                <ChevronDownIcon className={`h-5 w-5 transform transition-transform ${showBayRates ? 'rotate-180' : ''}`} />
              </button>
              <div className="hidden md:flex gap-4">
                <a href="/" className="text-white hover:text-gray-200">Home Page</a>
                <button onClick={onLogout} className="text-white hover:text-gray-200">Logout</button>
              </div>
              <div className="md:hidden">
                <Menu as="div" className="relative">
                  <Menu.Button className="flex items-center text-white hover:text-gray-200">
                    <span className="sr-only">Open menu</span>
                    <ChevronDownIcon className="h-6 w-6" />
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
                          onClick={onLogout}
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
          <div className="bg-white rounded-xl p-4 max-w-2xl w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Bay Rates</h3>
              <button onClick={() => setShowBayRates(false)} className="text-gray-500 hover:text-gray-700">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <Image
              src="/images/lengolf_bay_rate.jpg"
              alt="LENGOLF Bay Rates"
              width={800}
              height={600}
              className="rounded-xl"
            />
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Logo and Address */}
            <div>
              <a href="https://www.len.golf" className="block mb-4">
                <Image
                  src="/images/logo_v1.png"
                  alt="LENGOLF Logo"
                  width={150}
                  height={75}
                  className="mb-3"
                />
              </a>
              <a 
                href="https://maps.app.goo.gl/M7ygv921XyzcQwBE8" 
                target="_blank" 
                className="text-gray-600 hover:text-gray-800"
              >
                The Mercury Ville @ BTS Chidlom<br />
                Floor 4
              </a>
            </div>

            {/* Opening Hours */}
            <div>
              <h5 className="text-lg font-semibold mb-3">Opening Hours</h5>
              <p className="text-gray-600">
                10am – 11pm<br />
                Monday – Sunday
              </p>
            </div>

            {/* Keep in Touch */}
            <div>
              <h5 className="text-lg font-semibold mb-3">Keep in Touch</h5>
              <div className="text-gray-600 space-y-2">
                <a href="https://www.len.golf" className="block hover:text-gray-800">
                  www.len.golf
                </a>
                <p className="flex items-center">
                  <PhoneIcon className="h-4 w-4 mr-2" />
                  096-668-2335
                </p>
                <a 
                  href="mailto:info@len.golf" 
                  className="flex items-center hover:text-gray-800"
                >
                  <EnvelopeIcon className="h-4 w-4 mr-2" />
                  info@len.golf
                </a>
              </div>
            </div>

            {/* Social Media */}
            <div>
              <h5 className="text-lg font-semibold mb-3">Follow Us</h5>
              <div className="flex space-x-4">
                <a 
                  href="https://www.facebook.com/lengolf.bkk" 
                  target="_blank"
                  className="text-gray-600 hover:text-blue-600"
                >
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
} 