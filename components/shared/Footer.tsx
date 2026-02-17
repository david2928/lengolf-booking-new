'use client';

import Image from 'next/image';
import { PhoneIcon, EnvelopeIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { FaFacebookF, FaLine, FaInstagram } from 'react-icons/fa';

const SharedFooter = () => {
  return (
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
              className="group inline-flex items-start text-gray-600 hover:text-[#005a32] transition-colors mt-3"
            >
              <svg className="h-5 w-5 mr-2 text-[#005a32] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div>
                <span className="underline decoration-dotted underline-offset-2 group-hover:decoration-solid">
                  The Mercury Ville @ BTS Chidlom<br />
                  Floor 4
                </span>
                <span className="block text-xs mt-1 text-gray-500">Click for directions</span>
              </div>
            </a>
          </div>

          {/* Opening Hours */}
          <div>
            <p className="text-[#005a32] font-semibold mb-3">Opening Hours</p>
            <p className="text-gray-600">
              10am - 11pm<br />
              Monday - Sunday
            </p>
          </div>

          {/* Keep in Touch */}
          <div>
            <p className="text-[#005a32] font-semibold mb-3">Keep in Touch</p>
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
                <DocumentTextIcon className="h-4 w-4 mr-2 text-[#005a32]" />
                Privacy Policy
              </a>
            </div>
          </div>

          {/* Social Media */}
          <div>
            <p className="text-[#005a32] font-semibold mb-3">Follow Us</p>
            <div className="flex space-x-4">
              <a
                href="https://www.facebook.com/lengolf.bkk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#005a32] hover:text-[#007a42] transition-colors"
                aria-label="Facebook"
              >
                <FaFacebookF size={20} />
              </a>
              <a
                href="https://lin.ee/uxQpIXn"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#005a32] hover:text-[#007a42] transition-colors"
                aria-label="LINE"
              >
                <FaLine size={20} />
              </a>
              <a
                href="https://www.instagram.com/lengolf.bkk/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#005a32] hover:text-[#007a42] transition-colors"
                aria-label="Instagram"
              >
                <FaInstagram size={20} />
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
              className="group inline-flex items-start text-gray-600 hover:text-[#005a32] transition-colors justify-center"
            >
              <svg className="h-5 w-5 mr-2 text-[#005a32] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="text-left">
                <span className="underline decoration-dotted underline-offset-2 group-hover:decoration-solid">
                  The Mercury Ville @ BTS Chidlom<br />
                  Floor 4
                </span>
                <span className="block text-xs mt-1 text-gray-500">Tap for directions</span>
              </div>
            </a>
          </div>

          {/* Opening Hours */}
          <div className="text-center">
            <p className="text-[#005a32] font-semibold mb-2">Opening Hours</p>
            <p className="text-gray-600">
              10am - 11pm<br />
              Monday - Sunday
            </p>
          </div>

          {/* Contact Info */}
          <div className="text-center space-y-2">
            <p className="text-[#005a32] font-semibold mb-2">Keep in Touch</p>
            <a
              href="https://www.len.golf"
              className="block text-gray-600"
            >
              www.len.golf
            </a>
            <p className="text-gray-600 flex items-center justify-center">
              <PhoneIcon className="h-4 w-4 mr-2 text-[#005a32]" />
              096-668-2335
            </p>
            <a
              href="mailto:info@len.golf"
              className="flex items-center justify-center text-gray-600"
            >
              <EnvelopeIcon className="h-4 w-4 mr-2 text-[#005a32]" />
              info@len.golf
            </a>
            <a
              href="https://www.len.golf/privacy-policy/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center text-gray-600"
            >
              <DocumentTextIcon className="h-4 w-4 mr-2 text-[#005a32]" />
              Privacy Policy
            </a>
          </div>

          {/* Social Media Icons */}
          <div className="flex justify-center space-x-6">
            <a
              href="https://www.facebook.com/lengolf.bkk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#005a32]"
              aria-label="Facebook"
            >
              <FaFacebookF size={20} />
            </a>
            <a
              href="https://lin.ee/uxQpIXn"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#005a32]"
              aria-label="LINE"
            >
              <FaLine size={20} />
            </a>
            <a
              href="https://www.instagram.com/lengolf.bkk/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#005a32]"
              aria-label="Instagram"
            >
              <FaInstagram size={20} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default SharedFooter;